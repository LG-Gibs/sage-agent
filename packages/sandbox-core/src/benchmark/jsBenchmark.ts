import type { JsSandbox } from '../jsSandbox';

export interface JsBenchCase {
  name: string;
  code: string;
  expect: unknown;
}

/**
 * QuickJS execution benchmark. Each case is a self-contained expression whose
 * completion value is compared (JSON-deep) to `expect`. Exercises the language
 * surface a coding agent relies on: arithmetic, strings, arrays, objects, JSON,
 * closures, recursion, regex, Map/Set, destructuring, error handling, etc.
 */
export const JS_BENCHMARK: JsBenchCase[] = [
  { name: 'arithmetic precedence', code: '1 + 2 * 3', expect: 7 },
  { name: 'string upper', code: '"sage".toUpperCase()', expect: 'SAGE' },
  { name: 'array pipeline', code: '[1,2,3,4].filter(x=>x%2===0).map(x=>x*10).reduce((a,b)=>a+b,0)', expect: 60 },
  { name: 'json parse', code: 'JSON.parse("{\\"a\\":1}").a', expect: 1 },
  { name: 'json stringify', code: 'JSON.stringify({a:[1,2]})', expect: '{"a":[1,2]}' },
  { name: 'closure counter', code: '(()=>{let c=0; const inc=()=>++c; inc(); inc(); return c;})()', expect: 2 },
  { name: 'recursion fib', code: '(()=>{const f=n=>n<2?n:f(n-1)+f(n-2); return f(10);})()', expect: 55 },
  { name: 'math max', code: 'Math.max(3,7,2)', expect: 7 },
  { name: 'math floor', code: 'Math.floor(3.9)', expect: 3 },
  { name: 'math sqrt', code: 'Math.sqrt(144)', expect: 12 },
  { name: 'sort numeric', code: '[3,1,2].sort((a,b)=>a-b)', expect: [1, 2, 3] },
  { name: 'array reverse', code: '[1,2,3].reverse()', expect: [3, 2, 1] },
  { name: 'date utc year', code: 'new Date(0).getUTCFullYear()', expect: 1970 },
  { name: 'regex match', code: '"a1b2".match(/\\d/g).join("")', expect: '12' },
  { name: 'regex replace', code: '"foo bar".replace(/o/g,"0")', expect: 'f00 bar' },
  { name: 'template literal', code: '(()=>{const n="x"; return `hi ${n}`;})()', expect: 'hi x' },
  { name: 'spread max', code: 'Math.max(...[4,9,1])', expect: 9 },
  { name: 'object keys', code: 'Object.keys({a:1,b:2}).length', expect: 2 },
  { name: 'object assign', code: 'Object.assign({},{a:1},{b:2}).b', expect: 2 },
  { name: 'try catch', code: '(()=>{try{throw new Error("x")}catch(e){return e.message}})()', expect: 'x' },
  { name: 'array includes', code: '[1,2,3].includes(2)', expect: true },
  { name: 'string split', code: '"a,b,c".split(",").length', expect: 3 },
  { name: 'parseInt radix', code: 'parseInt("42px",10)', expect: 42 },
  { name: 'parseFloat', code: 'parseFloat("3.14")', expect: 3.14 },
  { name: 'ternary logic', code: '5>3 && 2<1 ? "a" : "b"', expect: 'b' },
  { name: 'map get', code: '(()=>{const m=new Map(); m.set("k",9); return m.get("k");})()', expect: 9 },
  { name: 'set size dedupe', code: '(()=>{const s=new Set([1,1,2]); return s.size;})()', expect: 2 },
  { name: 'reduce sum', code: '[1,2,3].reduce((a,b)=>a+b,0)', expect: 6 },
  { name: 'padStart', code: '"5".padStart(3,"0")', expect: '005' },
  { name: 'array flat', code: '[[1],[2,3]].flat().length', expect: 3 },
  { name: 'destructuring skip', code: '(()=>{const [a,,c]=[1,2,3]; return a+c;})()', expect: 4 },
  { name: 'default params', code: '(()=>{const f=(x=10)=>x*2; return f();})()', expect: 20 },
  { name: 'nested json roundtrip', code: 'JSON.parse(JSON.stringify({a:{b:[1,2,{c:3}]}})).a.b[2].c', expect: 3 },
  { name: 'array from', code: 'Array.from({length:3},(_,i)=>i*i)', expect: [0, 1, 4] },
  { name: 'boolean coercion', code: '[!!0, !!"x"]', expect: [false, true] },
  { name: 'string repeat', code: '"ab".repeat(3)', expect: 'ababab' },
  { name: 'number toFixed', code: 'Number((1/3).toFixed(2))', expect: 0.33 },
  { name: 'object entries map', code: 'Object.entries({a:1,b:2}).map(([k,v])=>k+v).join(",")', expect: 'a1,b2' },
];

export interface JsBenchResult {
  total: number;
  passed: number;
  rate: number;
  failures: Array<{ name: string; expected: unknown; got: unknown; error?: string }>;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function runJsBenchmark(sandbox: JsSandbox): Promise<JsBenchResult> {
  const failures: JsBenchResult['failures'] = [];
  let passed = 0;
  for (const c of JS_BENCHMARK) {
    const r = await sandbox.execute(c.code);
    if (r.ok && deepEqual(r.value, c.expect)) {
      passed += 1;
    } else {
      failures.push({ name: c.name, expected: c.expect, got: r.value, error: r.error?.message });
    }
  }
  return { total: JS_BENCHMARK.length, passed, rate: passed / JS_BENCHMARK.length, failures };
}
