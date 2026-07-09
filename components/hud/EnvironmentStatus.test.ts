import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import EnvironmentStatus from './EnvironmentStatus.vue'
import { useEnvironmentStore } from '~/stores/environment'

describe('EnvironmentStatus.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the ENVIRONMENT header', () => {
    const wrapper = mount(EnvironmentStatus)
    expect(wrapper.text()).toContain('ENVIRONMENT')
  })

  it('displays pollution, forest, water, biodiversity metrics', () => {
    const env = useEnvironmentStore()
    env.state.pollutionLevel = 42
    env.state.forestCoverage = 75
    env.state.waterQuality = 88
    env.state.biodiversity = 60
    const wrapper = mount(EnvironmentStatus)
    const text = wrapper.text()
    expect(text).toContain('Pollution')
    expect(text).toContain('42%')
    expect(text).toContain('Forest Cover')
    expect(text).toContain('75%')
    expect(text).toContain('Water Quality')
    expect(text).toContain('88%')
    expect(text).toContain('Biodiversity')
    expect(text).toContain('60%')
  })

  it('toggles pollution heatmap on button click', async () => {
    const env = useEnvironmentStore()
    const wrapper = mount(EnvironmentStatus)
    const buttons = wrapper.findAll('button')
    const pollutionBtn = buttons[0]!
    expect(env.showPollutionHeatmap).toBe(false)
    await pollutionBtn.trigger('click')
    expect(env.showPollutionHeatmap).toBe(true)
  })

  it('toggles biome degradation on button click', async () => {
    const env = useEnvironmentStore()
    const wrapper = mount(EnvironmentStatus)
    const buttons = wrapper.findAll('button')
    const biomeBtn = buttons[1]!
    expect(env.showBiomeDegradation).toBe(false)
    await biomeBtn.trigger('click')
    expect(env.showBiomeDegradation).toBe(true)
  })

  it('applies red color class when pollution > 70', async () => {
    const env = useEnvironmentStore()
    env.state.pollutionLevel = 80
    await nextTick()
    const wrapper = mount(EnvironmentStatus)
    expect(wrapper.html()).toContain('text-red-400')
  })

  it('applies green color class when pollution < 30', async () => {
    const env = useEnvironmentStore()
    env.state.pollutionLevel = 10
    await nextTick()
    const wrapper = mount(EnvironmentStatus)
    const html = wrapper.html()
    // The pollution row should have green-400
    expect(html).toContain('text-green-400')
  })
})