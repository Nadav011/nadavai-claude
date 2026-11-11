// The bindings of example/tours.json for one environment, here a web app (standard/help-system.md, "The tour
// manifest"). Not portable: the demo and the app each keep their own file, and only this file knows the DOM.
//
// An anchor that is not a key of `anchors` binds as the first visible [data-tour="<id>"], and a step's arg adds
// [data-tour-arg="<arg>"]: the demo's markup and the app's components carry those attributes, so "the first row of
// the filtered list" (patients.row) needs no code. Only a target that depends on state is a named resolver. The
// engine that reads this file owns visibility: a hit test that lands on the
// target, on an element inside it or on its ancestor counts as covering it; a target clipped by an ancestor whose
// overflow is not visible is not on screen; a target inside an inner scroll box is scrolled into that box's view
// before the step shows.
//
// Every function gets the environment's context x = { $, $$, app }: two query helpers that return visible elements
// only, and the app's own state. `app` here is invented for the example.
export default {
  // anchor id -> the element, for a target that depends on state
  anchors: {
    // the first free 45 minutes from now, in work hours
    'cal.free-slot': x => x.$(`[data-tour="cal.slot"][data-tour-arg="${x.app.calendar.firstFree(45)}"]`),
    // an appointment that ended and is not closed yet, never the sample's
    'cal.ended-appointment': x => {
      const a = x.app.calendar.endedNotClosed();
      return a ? x.$(`[data-tour="cal.appointment"][data-tour-arg="${a.id}"]`) : null;
    },
  },
  // recordOpen: the record behind an anchor, so the result can ask whether its window shows that record
  records: {
    'cal.ended-appointment': x => (x.app.calendar.endedNotClosed() || {}).id,
  },
  // custom result id -> predicate
  results: {
    'appt.service-chosen': x => x.app.booking.open && x.app.booking.serviceTouched,
  },
  // condition id (a step's `when`, a variant's `when`) -> predicate; phone and desktop are the engine's
  conditions: {
    'appt.other-picked': x => x.app.booking.open && !!x.app.booking.patient && !x.app.booking.patient.sample,
    'settings.msgs-closed': x => x.app.route.key !== 'settings-msgs',
  },
  // window id -> whether it is open (results open and step) and how a resume reopens it (need: reopen)
  windows: {
    'appt.create': { isOpen: x => x.app.booking.open, reopen: x => x.app.booking.reopenAtTourSlot(), step: x => x.app.booking.step },
    'appt.drawer': { isOpen: x => x.app.drawer.open, reopen: x => x.app.drawer.reopenLast() },
    'pay.sheet': { isOpen: x => x.app.pay.open, reopen: x => x.app.pay.reopenLast() },
    'settings.edit-sheet': { isOpen: x => x.app.sheet.open, reopen: x => x.app.sheet.reopenLast() },
  },
  // state id (result stateEquals) -> its current value
  state: {
    'patients.filter': x => x.app.patients.filter,
    'pay.method': x => x.app.pay.method,
  },
  // result route and view: the keys the app is on now
  route: x => x.app.route.key,
  view: x => x.app.route.key,
  // need: selectSample
  selectSample: x => x.app.booking.pickSample(),
};
