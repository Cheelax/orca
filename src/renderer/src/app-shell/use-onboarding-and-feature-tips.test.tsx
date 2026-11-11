// @vitest-environment happy-dom

import { act, type JSX } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultOnboardingState } from '../../../shared/onboarding-defaults'
import { createGlobalSettingsFixture } from '../../../shared/global-settings-test-fixture'
import type { ChatUiLaunchTipVariant } from '../../../shared/native-chat/chat-ui-launch-tip-audience'
import { useAppStore } from '@/store'
import { useOnboardingAndFeatureTips } from './use-onboarding-and-feature-tips'

vi.mock('@/diagnostics/telemetry/telemetry', () => ({ track: vi.fn() }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function Gate(): JSX.Element | null {
  const gate = useOnboardingAndFeatureTips()
  if (gate.onboarding === null) {
    gate.applyStartupOnboardingState({ ...getDefaultOnboardingState(), closedAt: 1 })
  }
  return <output>{String(gate.chatUiHereCornerCardOpen)}</output>
}

/** A control the earlier rollout held back: suppressing it already marked the older ids seen. */
async function launchHeldBackControl(
  agentDefaultSurface: 'terminal' | 'chat',
  variant: ChatUiLaunchTipVariant = 'chat-ui-off'
): Promise<boolean> {
  vi.mocked(window.api.onboarding.getChatUiLaunchTipVariant).mockResolvedValue(variant)
  useAppStore.setState({
    persistedUIReady: true,
    featureTipsSeenIds: ['chat-ui-here', 'chat-ui-here-rollout-v1'],
    settings: createGlobalSettingsFixture({
      agentDefaultSurface,
      aiVaultSearch: { enabled: true, historyDays: null },
      telemetry: {
        optedIn: true,
        installId: 'install',
        existedBeforeTelemetryRelease: true,
        chatUiLaunchTipCohort: 'control',
        chatUiLaunchTipRolloutCohort: 'control'
      }
    })
  })
  await act(async () => root.render(<Gate />))
  return container.querySelector('output')?.textContent === 'true'
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { set: vi.fn().mockResolvedValue(undefined) },
      cli: { getInstallStatus: vi.fn().mockResolvedValue({ supported: false }) },
      onboarding: { getChatUiLaunchTipVariant: vi.fn() }
    }
  })
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
})

it('now shows the Chat UI card to a held-back control on the terminal', async () => {
  expect(await launchHeldBackControl('terminal')).toBe(true)
  expect(useAppStore.getState().featureTipsSeenIds).toContain('chat-ui-here-rollout-v2')
})

it('keeps a held-back control already on Chat UI out for good', async () => {
  expect(await launchHeldBackControl('chat')).toBe(false)
  expect(useAppStore.getState().featureTipsSeenIds).toContain('chat-ui-here-rollout-v2')
  expect(useAppStore.getState().modalData).toMatchObject({ tipId: 'cmd-j-palette' })
})

it('keeps a held-back control that switched back from Chat UI out', async () => {
  expect(await launchHeldBackControl('terminal', 'chat-ui-on')).toBe(false)
  expect(useAppStore.getState().modalData).toMatchObject({ tipId: 'cmd-j-palette' })
})
