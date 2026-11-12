// The bindings of example/tours.json for one environment, here a web app (standard/help-system.md, "The tour
// manifest"). Not portable: the demo and the app each keep their own file, and only this file knows the DOM.
//
// An anchor that is not a key of `anchors` binds as the first visible [data-tour="<id>"], and a step's arg adds
// [data-tour-arg="<arg>"]: the demo's markup and the app's components carry those attributes, so "the first row of
// the filtered list" (patients.row, a showing step that acts on nobody) needs no code. A binding for a step marked
// on: "sample" selects by the sample's record id, never by position: on a list of people's rows it is a resolver
// (cal.ended-appointment below); a plain binding serves only a control inside a window already opened on the
// sample (appt.paid, pay.method, pay.confirm), one that is nobody's record, or the picker of a window opened on
// nobody (appt.patient-picker), whose custom result checks the sample was picked, and that window's controls after it
// (appt.service). Only a target that depends on state is a named resolver. The engine that reads this file owns visibility: a hit test that lands on the target, on an
// element inside it or on its ancestor counts as covering it; a target clipped by an ancestor whose overflow is not
// visible is not on screen; a target inside an inner scroll box is scrolled into that box's view before the step
// shows.
//
// Every function gets the environment's context x = { $, $$, app }: two query helpers that return visible elements
// only, and the app's own state. `app` here is invented for the example.
export default {
  // anchor id -> the element, for a target that depends on state
  anchors: {
    // the first free 45 minutes from now, in work hours
    'cal.free-slot': x => x.$(`[data-tour="cal.slot"][data-tour-arg="${x.app.calendar.firstFree(45)}"]`),
    // the sample record's appointment that ended and is not closed yet: practice data that comes with the sample
    // record (G-08), never a real person's appointment
    'cal.ended-appointment': x => {
      const a = x.app.calendar.sampleEndedNotClosed();
      return a ? x.$(`[data-tour="cal.appointment"][data-tour-arg="${a.id}"]`) : null;
    },
  },
  // recordOpen: the record behind an anchor, so the result can ask whether its window shows that record
  records: {
    'cal.ended-appointment': x => (x.app.calendar.sampleEndedNotClosed() || {}).id,
  },
  // custom result id -> predicate
  results: {
    // the booking's patient is the sample record: picking anyone else does not move the step on
    'appt.sample-picked': x => x.app.booking.open && !!x.app.booking.patient && !!x.app.booking.patient.sample,
  },
  // condition id (a step's `when`, a variant's `when`) -> predicate; phone and desktop are the engine's
  conditions: {
    'appt.other-picked': x => x.app.booking.open && !!x.app.booking.patient && !x.app.booking.patient.sample,
    'settings.msgs-closed': x => x.app.route.key !== 'settings-msgs',
  },
  // window id -> whether it is open (results open and step) and how the run reopens it (need: reopen). A reopen
  // puts back the tour's own record, the sample's, never the last one open: she may have opened a real person's since.
  // With no sample record (removed, or its appointment closed) a reopen does nothing and the step only shows; inside
  // practice mode the sample's record is its copy. The engine asks her before it runs a need over something she chose
  // or typed since (G-08); the bindings only do it
  windows: {
    // a window that picks a person counts as open only while it is the tour's own and every person field it has holds
    // the sample or is empty (this booking has one, the patient; the therapist is staff, not a person field). The tour's
    // own is the new booking the tour's step opened at its slot, never an existing appointment's edit form at that slot
    // (it has a record). Its reopen closes every open booking form, an existing appointment's edit form included (the
    // engine asks first when one holds her input), and opens the tour's own afresh with the patient empty, so isOpen
    // holds after it and selectSample then picks her
    'appt.create': { isOpen: x => x.app.booking.open && !!x.app.booking.atTourSlot && !x.app.booking.record && (!x.app.booking.patient || !!x.app.booking.patient.sample), reopen: x => { x.app.booking.closeAll(); x.app.booking.openNewAtTourSlot(); }, step: x => x.app.booking.step },
    // a window opened on one person counts as open only while it shows the sample's record, so a resume over a real
    // person's open drawer or sheet reopens the sample's instead of leaving hers in place
    'appt.drawer': { isOpen: x => x.app.drawer.open && !!x.app.drawer.record && !!x.app.drawer.record.sample, reopen: x => x.app.drawer.openFor(x.app.calendar.sampleEndedNotClosed()) },
    'pay.sheet': { isOpen: x => x.app.pay.open && !!x.app.pay.record && !!x.app.pay.record.sample, reopen: x => x.app.pay.openFor(x.app.calendar.sampleEndedNotClosed()) },
    // a settings rule is nobody's record, but the sheet counts as open only on the tour's own row, and the reopen opens
    // that row, not the last sheet opened
    'settings.edit-sheet': { isOpen: x => x.app.sheet.open && x.app.sheet.row === 'reminder-before', reopen: x => x.app.sheet.openFor('reminder-before') },
  },
  // state id (result stateEquals) -> its current value
  state: {
    'patients.filter': x => x.app.patients.filter,
    'pay.method': x => x.app.pay.method,
  },
  // result route and view: the keys the app is on now
  route: x => x.app.route.key,
  view: x => x.app.route.key,
  // need: selectSample, which the engine runs each time it reaches the step, after the step's reopen, asking first whenever
  // the window holds anyone but the sample; here it picks her as the booking's patient
  selectSample: x => x.app.booking.pickSample(),
};
