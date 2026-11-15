import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@openai/apps-sdk-ui/components/Button';
import { Slider, type SliderProps } from '@openai/apps-sdk-ui/components/Slider';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';

export interface ValueControl<T> {
  element: HTMLElement;
  readonly value: T;
  setValue(value: T): void;
}
type Target = { container?: HTMLElement };
type SliderOptions = Target & Omit<SliderProps, 'onChange' | 'ref' | 'label'> & {
  label: string;
  onChange?: (value: number) => void;
};
type ButtonOptions = Target & Pick<ButtonProps, 'color' | 'variant' | 'size' | 'disabled'> & {
  label: string;
  onClick: () => void;
};
type ToggleOptions = Target & { label: string; value: boolean; disabled?: boolean; onChange?: (value: boolean) => void };
type SegmentedOptions = Target & {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange?: (value: string) => void;
};

/** Only imported by the isolated frame. Every React root belongs to that run. */
export function createUI(parent: HTMLElement, register: (cleanup: () => void) => void,
  signal: AbortSignal, measure: () => void) {
  function mount(container: HTMLElement, render: () => ReactNode) {
    const element = parent.ownerDocument.createElement('div');
    element.className = 'interactive-js-control';
    container.append(element);
    const root = createRoot(element);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    register(() => { observer.disconnect(); root.unmount(); element.remove(); });
    const update = () => { if (!signal.aborted) root.render(render()); };
    update();
    return { element, update };
  }
  function control<T>(container: HTMLElement, initial: T,
    render: (value: T, change: (value: T) => void) => ReactNode, onChange?: (value: T) => void): ValueControl<T> {
    let value = initial;
    const change = (next: T) => {
      if (signal.aborted) return;
      value = next;
      mounted.update();
      onChange?.(next);
    };
    const mounted = mount(container, () => render(value, change));
    return { element: mounted.element, get value() { return value; }, setValue: change };
  }
  return {
    slider({ container = parent, onChange, ...options }: SliderOptions) {
      if (![options.min, options.max, options.step, options.value].every(Number.isFinite) || options.max <= options.min || options.step <= 0)
        throw new RangeError('滑块需要有效的范围、正步长和初始值');
      return control(container, options.value,
        (value, change) => <Slider {...options} value={value} onChange={change} />, onChange);
    },
    button({ container = parent, label, onClick, ...options }: ButtonOptions) {
      return mount(container, () => <Button {...options} onClick={() => { if (!signal.aborted) onClick(); }}>{label}</Button>).element;
    },
    toggle({ container = parent, label, value, disabled, onChange }: ToggleOptions) {
      return control(container, value,
        (checked, change) => <Switch label={label} checked={checked} disabled={disabled} onCheckedChange={change} />, onChange);
    },
    segmented({ container = parent, label, value, options, onChange }: SegmentedOptions) {
      return control(container, value,
        (selected, change) => <SegmentedControl value={selected} onChange={change} aria-label={label} size="sm">
          {options.map(option => <SegmentedControl.Option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SegmentedControl.Option>)}
        </SegmentedControl>, onChange);
    },
  };
}
