# JavaScript blocks

Ordinary `js` and `javascript` display source. Use `js-widget` for isolated
interactive charts in private notes. `javascript-widget` is an alias. Existing first-line
`// @obsidian-js` blocks remain supported. Source view always shows source.

The supplied values are `container`, `sourcePath`, `component`, `echarts`,
`chart`, `ui`, `widgets`, `watch`, `onCleanup`, `renderMarkdown`, and `signal`.
`document` and `window` belong to the isolated chart. Create local elements with
`document.createElement`. Declare variables before using them. The application
DOM, `app`, Vault writes, native APIs, storage and network requests are unavailable.

```js
// This example is displayed, never executed.
container.textContent = 'Hello';
```

## A dynamic control

```js-widget
const label = document.createElement('output');
const slider = ui.slider({
  label: '参数', min: 0, max: 100, step: 1, value: 40,
  onChange: value => { label.textContent = `Value: ${value}`; }
});
ui.button({ label: '重置', onClick: () => slider.setValue(40) });
container.append(label);
label.textContent = `Value: ${slider.value}`;
```

## A chart

```js-widget
const plot = chart({
  tooltip: {},
  xAxis: { type: 'category', data: ['A', 'B', 'C'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [5, 12, 8] }]
}, { height: 300 });
// chart returns the ECharts instance synchronously.
plot.setOption({ animationDuration: 250 });
```

`ui` mounts the actual OpenAI Apps SDK UI components. Slider, Button, Switch and
SegmentedControl styles and their resources are bundled locally. Each value
control returns `element`, a current `value` getter and `setValue(value)`.
`setValue` invokes the same `onChange` callback as user input.

```js-widget
ui.toggle({ label: '显示辅助线', value: true, onChange: value => { container.dataset.guides = String(value); } });
ui.segmented({
  label: '坐标', value: 'linear',
  options: [{ value: 'linear', label: '线性' }, { value: 'log', label: '对数' }],
  onChange: value => { container.dataset.scale = value; }
});
```

`chart()` uses the official palette and text/grid/tooltip colors and follows the
application's light/dark theme. Explicit ECharts options retain precedence.
The public library's source is https://github.com/openai/apps-sdk-ui.

## Effective potential with an OpenAI slider

```js-widget
const quantum = ui.slider({
  label: '角量子数 l', min: 0, max: 8, step: 1, value: 1,
  onChange: () => draw()
});
ui.button({ label: '重置', onClick: () => quantum.setValue(1) });
const plot = chart({
  animation: false,
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0 },
  grid: { left: 65, right: 25, top: 25, bottom: 80 },
  xAxis: { type: 'value', name: 'ρ = r/a₀', nameLocation: 'middle', nameGap: 30 },
  yAxis: { type: 'value', name: 'V / Eₕ' }
}, { height: 360 });
function draw() {
  const l = quantum.value;
  const L = l * (l + 1);
  const end = l === 0 ? 12 : Math.max(12, 1.8 * L);
  const radius = Array.from({ length: 1501 }, (_, i) => 0.12 + (end - 0.12) * i / 1500);
  const data = fn => radius.map(r => [r, fn(r)]);
  plot.setOption({
    xAxis: { min: 0.12, max: end },
    yAxis: { min: l === 0 ? -3.5 : -1.7 / (2 * L), max: l === 0 ? 0.8 : 3 / L },
    series: [
      { name: '有效势能', type: 'line', showSymbol: false, data: data(r => -1 / r + L / (2 * r * r)) },
      { name: '库仑势', type: 'line', showSymbol: false, lineStyle: { type: 'dashed' }, data: data(r => -1 / r) },
      { name: '离心势垒', type: 'line', showSymbol: false, lineStyle: { type: 'dashed' }, data: data(r => L / (2 * r * r)) }
    ]
  });
}
draw();
```

For custom animations, register their cleanup. The chart helper already owns its
observer and chart disposal; do not dispose it a second time.

```js-widget
const text = document.createElement('p'); container.append(text);
const timer = window.setInterval(() => { text.textContent = new Date().toLocaleTimeString(); }, 1000);
onCleanup(() => window.clearInterval(timer));
```

## Existing personal widgets

```js-widget
await widgets.outline({ target: '[[]]' });
```

```js-widget
await widgets.directoryIndex();
```

```js-widget
await widgets.callouts({ note: 'Example note', type: 'tactic' });
```

`widgets.folderTagOverview({mode:'folders'})`, the `rules` mode and
`widgets.uptimer(options)` retain the original plugin's options. The directory
index groups PDF/MD in child folders containing 正文. Widgets subscribe to their
inputs automatically; custom scripts use `watch('path/to/data.md')` explicitly.

`await watch(path)` watches a dependency through the host. Built-in widgets keep
their read-only access and render next to the chart through the native renderer.
`await renderMarkdown(text)` also uses that renderer, with nested execution
disabled. DOM targets cannot cross the iframe boundary.

Print shows source. Removing a frame releases its timers, DOM and chart resources.
Use `onCleanup` for local library cleanup. Scrolling out of CodeMirror's virtual
DOM or entering source mode can dispose an output. Control state is local to each
mount. The frame provides a capability boundary. An infinite loop or excessive
memory allocation can still make the renderer unresponsive.
