import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { ResourceCategory, type ResourceOverviewRow, ResourceUnit, TrendDirection } from '~/lib/types/resource';
import { useResourcesStore } from '~/stores/resources';
import { useUiStore } from '~/stores/ui';
import ResourceTracker from './ResourceTracker.vue';

function makeRow(overrides: Partial<ResourceOverviewRow> = {}): ResourceOverviewRow {
  return {
    resourceKey: 'fe',
    name: 'Iron',
    category: ResourceCategory.Element,
    collected: 50,
    remaining: 1000,
    total: 1050,
    unit: ResourceUnit.Tonne,
    productionRate: 0,
    trend: TrendDirection.Stable,
    ...overrides,
  };
}

describe('resourceTracker.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the RESOURCES header', () => {
    const wrapper = mount(ResourceTracker);
    expect(wrapper.text()).toContain('RESOURCES');
  });

  it('displays resource rows by category', async () => {
    const resources = useResourcesStore();
    resources.rows = [
      makeRow({ resourceKey: 'fe', name: 'Iron', category: ResourceCategory.Element }),
      makeRow({ resourceKey: 'wood', name: 'Wood', category: ResourceCategory.Renewable }),
    ];
    await nextTick();
    const wrapper = mount(ResourceTracker);
    // Categories are expanded by default (collapsed[key] is undefined → !undefined = true)
    expect(wrapper.text()).toContain('Iron');
    expect(wrapper.text()).toContain('Wood');
  });

  it('filters resources by search term', async () => {
    const resources = useResourcesStore();
    resources.rows = [
      makeRow({ resourceKey: 'fe', name: 'Iron', category: ResourceCategory.Element }),
      makeRow({ resourceKey: 'cu', name: 'Copper', category: ResourceCategory.Element }),
    ];
    await nextTick();
    const wrapper = mount(ResourceTracker);
    const input = wrapper.find('input');
    await input.setValue('iron');
    await nextTick();
    expect(wrapper.text()).toContain('Iron');
    expect(wrapper.text()).not.toContain('Copper');
  });

  it('toggles category collapse on button click', async () => {
    const resources = useResourcesStore();
    resources.rows = [makeRow({ resourceKey: 'fe', name: 'Iron', category: ResourceCategory.Element })];
    await nextTick();
    const wrapper = mount(ResourceTracker);
    // Find the Elements category button (3rd one: Renewable, Non-Renewable, Elements, Manufactured)
    const buttons = wrapper.findAll('button');
    const elementsBtn = buttons[2]!;
    // Initially expanded (shows Iron)
    expect(wrapper.text()).toContain('Iron');
    await elementsBtn.trigger('click');
    await nextTick();
    // Collapsed — Iron should not be visible
    expect(wrapper.text()).not.toContain('Iron');
  });

  it('calls ui.selectResource on row click', async () => {
    const resources = useResourcesStore();
    resources.rows = [makeRow({ resourceKey: 'fe', name: 'Iron', category: ResourceCategory.Element })];
    await nextTick();
    const wrapper = mount(ResourceTracker);
    const ui = useUiStore();
    const row = wrapper.find('.cursor-pointer');
    await row.trigger('click');
    expect(ui.selectedResourceKey).toBe('fe');
  });

  it('formats large quantities with k/M/G suffixes', async () => {
    const resources = useResourcesStore();
    resources.rows = [
      makeRow({ resourceKey: 'big', name: 'BigDep', collected: 1500000, total: 5000000000, category: ResourceCategory.NonRenewable }),
    ];
    await nextTick();
    const wrapper = mount(ResourceTracker);
    const text = wrapper.text();
    expect(text).toContain('1.5M');
    expect(text).toContain('5.0G');
  });
});
