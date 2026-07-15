import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Spinner from './Spinner.vue';

describe('spinner.vue', () => {
  it('renders a span with animate-spin class', () => {
    const wrapper = mount(Spinner);
    const span = wrapper.find('span');
    expect(span.exists()).toBe(true);
    expect(span.classes()).toContain('animate-spin');
  });

  it('applies default size of 1em', () => {
    const wrapper = mount(Spinner);
    expect(wrapper.find('span').attributes('style')).toContain('width: 1em');
    expect(wrapper.find('span').attributes('style')).toContain('height: 1em');
  });

  it('accepts custom size', () => {
    const wrapper = mount(Spinner, { props: { size: '2rem' } });
    const style = wrapper.find('span').attributes('style');
    expect(style).toContain('width: 2rem');
    expect(style).toContain('height: 2rem');
  });

  it('accepts custom color', () => {
    const wrapper = mount(Spinner, { props: { color: '#ff0000' } });
    const style = wrapper.find('span').attributes('style');
    expect(style).toContain('#ff0000');
    expect(style).toContain('transparent');
  });

  it('uses currentColor by default', () => {
    const wrapper = mount(Spinner);
    const style = wrapper.find('span').attributes('style');
    expect(style).toContain('currentcolor');
  });
});
