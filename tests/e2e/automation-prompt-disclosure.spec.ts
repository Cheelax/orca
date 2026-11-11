import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

const SHORT_NAME = 'synthetic-short-prompt-demo'
const RESIZE_NAME = 'synthetic-resize-prompt-demo'
const LONG_NAME = 'visual-proof-long-prompt-demo'
const END_MARKER = 'SYNTHETIC-END-MARKER'
// Exactly eight short lines: the most a collapsed preview shows without a toggle.
const SHORT_PROMPT = Array.from({ length: 8 }, (_, index) => `Short step ${index + 1}.`).join('\n')
// Seven ~72-character lines: one row each at 1400px, two each (14 rows) at 820px.
const RESIZE_PROMPT = Array.from(
  { length: 7 },
  (_, index) => `Synthetic resize line ${index + 1}: ${'placeholder '.repeat(4).trim()}`
).join('\n')

test('automation detail shows prompts of up to eight lines whole and discloses longer ones', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.setViewportSize({ width: 820, height: 700 })

  await orcaPage.evaluate(
    async ({ shortName, shortPrompt, resizeName, resizePrompt, longName, endMarker }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const repo = store.getState().repos[0]
      if (!repo) {
        throw new Error('Seeded test repo is not available')
      }
      const base = {
        agentId: 'codex' as const,
        repo: `id:${repo.id}`,
        workspaceMode: 'new_per_run' as const,
        reuseSession: false,
        timezone: 'UTC',
        rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
        dtstart: Date.now(),
        enabled: false,
        missedRunGraceMinutes: 720
      }
      const createAutomation = async (params: typeof base & { name: string; prompt: string }) => {
        const response = await window.api.runtime.call({ method: 'automation.create', params })
        if (!response.ok) {
          throw new Error(`${response.error.code}: ${response.error.message}`)
        }
      }
      await createAutomation({
        ...base,
        name: shortName,
        prompt: shortPrompt
      })
      await createAutomation({
        ...base,
        name: longName,
        prompt: [
          'Synthetic prompt preview validation only.',
          '',
          ...Array.from(
            { length: 20 },
            (_, index) =>
              `Synthetic step ${index + 1}: inspect placeholder input and summarize placeholder output.`
          ),
          '',
          `UNBROKEN_SYNTHETIC_${'X'.repeat(240)}`,
          '',
          endMarker
        ].join('\n')
      })
      await createAutomation({
        ...base,
        name: resizeName,
        prompt: resizePrompt
      })
      store.getState().openAutomationsPage()
    },
    {
      shortName: SHORT_NAME,
      shortPrompt: SHORT_PROMPT,
      resizeName: RESIZE_NAME,
      resizePrompt: RESIZE_PROMPT,
      longName: LONG_NAME,
      endMarker: END_MARKER
    }
  )

  const promptShowsAllText = (element: HTMLElement): boolean =>
    element.scrollHeight <= element.clientHeight + 1 &&
    element.scrollWidth <= element.clientWidth + 1

  await orcaPage.getByRole('button', { name: new RegExp(`^${SHORT_NAME}`) }).click()
  const shortPrompt = orcaPage.getByText('Short step 8.')
  await expect(shortPrompt).toBeVisible()
  expect(await shortPrompt.evaluate(promptShowsAllText)).toBe(true)
  await expect(orcaPage.getByRole('button', { name: 'Show more' })).toHaveCount(0)

  await orcaPage.getByRole('button', { name: 'All automations' }).click()
  await orcaPage.getByRole('button', { name: new RegExp(`^${RESIZE_NAME}`) }).click()
  const resizeToggle = orcaPage.getByRole('button', { name: /^Show (more|less)$/ })
  await expect(resizeToggle).toHaveText('Show more')
  await expect(resizeToggle).toHaveAttribute('aria-expanded', 'false')
  const resizePrompt = orcaPage.locator(
    `[id="${await resizeToggle.getAttribute('aria-controls')}"]`
  )
  expect(await resizePrompt.evaluate(promptShowsAllText)).toBe(false)

  await resizeToggle.focus()
  await orcaPage.keyboard.press('Enter')
  await expect(resizeToggle).toHaveText('Show less')
  await expect(resizeToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(resizeToggle).toBeFocused()
  expect(await resizePrompt.evaluate(promptShowsAllText)).toBe(true)

  await orcaPage.keyboard.press('Enter')
  await expect(resizeToggle).toHaveText('Show more')
  await expect(resizeToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(resizeToggle).toBeFocused()
  expect(await resizePrompt.evaluate(promptShowsAllText)).toBe(false)

  // Widening until the prompt fits removes the toggle and keeps focus inside the prompt.
  await orcaPage.setViewportSize({ width: 1400, height: 700 })
  await expect(resizeToggle).toHaveCount(0)
  await expect(resizePrompt).toBeFocused()
  expect(await resizePrompt.evaluate(promptShowsAllText)).toBe(true)

  await orcaPage.setViewportSize({ width: 820, height: 700 })
  await orcaPage.getByRole('button', { name: 'All automations' }).click()
  await orcaPage.getByRole('button', { name: new RegExp(`^${LONG_NAME}`) }).click()

  const prompt = orcaPage.getByText(new RegExp(END_MARKER))
  const toggle = orcaPage.getByRole('button', { name: /^Show (more|less)$/ })
  await expect(toggle).toHaveText('Show more')
  expect(await toggle.getAttribute('aria-controls')).toBe(await prompt.getAttribute('id'))
  expect(await prompt.evaluate(promptShowsAllText)).toBe(false)

  await toggle.focus()
  await orcaPage.keyboard.press('Enter')
  await expect(toggle).toHaveText('Show less')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toBeFocused()
  expect(await prompt.evaluate(promptShowsAllText)).toBe(true)

  const markerProof = await prompt.evaluate(async (element, marker) => {
    const text = element.firstChild
    if (!(text instanceof Text)) {
      throw new Error('Prompt text node is unavailable')
    }
    const start = text.data.indexOf(marker)
    if (start === -1) {
      throw new Error('Prompt end marker is unavailable')
    }
    const range = document.createRange()
    range.setStart(text, start)
    range.setEnd(text, start + marker.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const scrollContainer = element.closest('[role="tabpanel"]')
    if (!(scrollContainer instanceof HTMLElement)) {
      throw new Error('Automation overview scroll container is unavailable')
    }
    scrollContainer.scrollTop +=
      range.getBoundingClientRect().bottom - scrollContainer.getBoundingClientRect().bottom + 16
    await new Promise(requestAnimationFrame)
    const markerRect = range.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    return {
      selectedText: selection?.toString(),
      markerTop: markerRect.top,
      markerBottom: markerRect.bottom,
      visibleTop: containerRect.top,
      visibleBottom: containerRect.bottom
    }
  }, END_MARKER)
  expect(markerProof.selectedText).toBe(END_MARKER)
  expect(markerProof.markerTop).toBeGreaterThanOrEqual(markerProof.visibleTop)
  expect(markerProof.markerBottom).toBeLessThanOrEqual(markerProof.visibleBottom)

  await toggle.focus()
  await orcaPage.keyboard.press('Enter')
  await expect(toggle).toHaveText('Show more')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
  expect(await prompt.evaluate(promptShowsAllText)).toBe(false)
})
