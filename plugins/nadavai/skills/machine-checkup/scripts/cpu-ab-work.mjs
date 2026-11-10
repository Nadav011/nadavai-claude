// One single-threaded unit of the work agents really run (V8: sorting, JSON, regex, object churn),
// repeated for a fixed time. Prints how many units it finished. Used by cpu-ab.sh.
const seconds = Number(process.argv[2] || 8);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const nums = Array.from({ length: 20000 }, rnd);
const tree = Array.from({ length: 300 }, (_, i) => ({
  id: i, name: `item-${i}`, tags: ['a', 'b', 'c'].map((t) => t + i), score: rnd(),
  nested: { path: `/src/module-${i}/index.ts`, lines: Array.from({ length: 12 }, (_, j) => `const v${j} = ${j * i};`) },
}));
const text = tree.map((t) => t.nested.lines.join('\n')).join('\n');
const end = Date.now() + seconds * 1000;
let units = 0, sink = 0;
while (Date.now() < end) {
  sink += nums.slice().sort((a, b) => a - b)[100];
  sink += JSON.parse(JSON.stringify(tree)).length;
  sink += text.replace(/const (v\d+) = (\d+);/g, 'let $1 = $2 + 1;').length;
  const m = new Map();
  for (let i = 0; i < 20000; i++) m.set(`k${i % 997}`, (m.get(`k${i % 997}`) || 0) + i);
  sink += m.size;
  units++;
}
if (sink < 0) console.error(sink);
console.log(units);
