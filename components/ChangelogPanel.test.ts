import type { ChangelogEntry } from '~/types/changelog';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChangelogPanel from './ChangelogPanel.vue';

const sampleData: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-07-15',
    summary: 'Public release',
    changes: {
      added: ['Version display', 'Changelog panel'],
      changed: ['Hide start button after creation'],
      fixed: ['Pollution overlay bug'],
    },
  },
  {
    version: '0.0.1',
    date: '2026-07-08',
    summary: 'Initial scaffold',
    changes: {
      added: ['Project scaffold'],
    },
  },
];

const mountOpts = {
  props: { data: sampleData, open: true },
  global: { stubs: { Teleport: true } },
};

describe('changelogPanel.vue', () => {
  it('does not render modal when open is false', () => {
    const wrapper = mount(ChangelogPanel, {
      props: { data: sampleData, open: false },
      global: { stubs: { Teleport: true } },
    });
    expect(wrapper.find('h2').exists()).toBe(false);
  });

  it('renders modal with CHANGELOG header when open', () => {
    const wrapper = mount(ChangelogPanel, mountOpts);
    expect(wrapper.find('h2').text()).toBe('CHANGELOG');
  });

  it('displays all version entries', () => {
    const wrapper = mount(ChangelogPanel, mountOpts);
    const text = wrapper.text();
    expect(text).toContain('v0.1.0');
    expect(text).toContain('v0.0.1');
    expect(text).toContain('Public release');
    expect(text).toContain('Initial scaffold');
  });

  it('shows ADDED, CHANGED, and FIXED sections', () => {
    const wrapper = mount(ChangelogPanel, mountOpts);
    const text = wrapper.text();
    expect(text).toContain('ADDED');
    expect(text).toContain('CHANGED');
    expect(text).toContain('FIXED');
    expect(text).toContain('Version display');
    expect(text).toContain('Hide start button after creation');
    expect(text).toContain('Pollution overlay bug');
  });

  it('emits update:open false when close button clicked', async () => {
    const wrapper = mount(ChangelogPanel, mountOpts);
    const closeBtn = wrapper.find('button');
    await closeBtn.trigger('click');
    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0]).toEqual([false]);
  });

  it('emits update:open false when backdrop clicked', async () => {
    const wrapper = mount(ChangelogPanel, mountOpts);
    const backdrop = wrapper.find('.fixed.inset-0');
    await backdrop.trigger('click');
    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0]).toEqual([false]);
  });
});
