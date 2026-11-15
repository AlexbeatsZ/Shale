/** Values come from the bundled official Apps SDK UI CSS in the frame. */
export function chartTheme(element: HTMLElement) {
  const style = getComputedStyle(element);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const dark = element.ownerDocument.documentElement.dataset.theme === 'dark';
  const axis = {
    axisLine: { lineStyle: { color: color('--gray-250') } },
    axisTick: { show: false },
    axisLabel: { color: color('--color-text-secondary') },
    nameTextStyle: { color: color('--color-text-secondary') },
    splitLine: { lineStyle: { color: color('--gray-100') } },
  };
  return {
    darkMode: dark,
    backgroundColor: 'transparent',
    color: ['blue', 'green', 'purple', 'orange', 'red', 'pink'].map(name => color(`--${name}-${dark ? 400 : 500}`)),
    textStyle: { color: color('--color-text'), fontFamily: color('--font-sans') },
    title: { textStyle: { color: color('--color-text') }, subtextStyle: { color: color('--color-text-secondary') } },
    legend: { textStyle: { color: color('--color-text-secondary') } },
    categoryAxis: axis, valueAxis: axis, logAxis: axis, timeAxis: axis,
    tooltip: {
      backgroundColor: color('--gray-0'), borderColor: color('--gray-150'),
      textStyle: { color: color('--color-text') },
      extraCssText: 'border-radius:12px;box-shadow:0 4px 20px #0002;',
    },
    line: { lineStyle: { width: 2.5 } },
  };
}
