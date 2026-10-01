import { AIRich } from './AIRich.js'
import { createRich, sendRich } from './Rich.js'
import { Button } from './Button.js'
import { ButtonV2 } from './ButtonV2.js'
import { ButtonV3 } from './ButtonV3.js'
import { Carousel } from './Carousel.js'
import { Poll } from './Poll.js'
import { A2UI } from './A2UI.js'

/**
 * JapBaileys — unified builder hub.
 *
 * Every builder keeps living in its own class/file; this class only provides
 * a single entry point to construct any of them from one place.
 */
class JapBaileys {
  constructor(client) {
    if (!client) {
      throw new TypeError(
        'JapBaileys(client) requires an active Baileys socket/client'
      )
    }

    this.client = client
  }

  // ===== AIRICH =====

  airich() {
    return new AIRich(this.client)
  }

  japAI() {
    return new AIRich(this.client)
  }

  aiJap() {
    return new AIRich(this.client)
  }

  leafRich() {
    return new AIRich(this.client)
  }

  japRich(input) {
    return input === undefined ? new AIRich(this.client) : createRich(this.client, input)
  }

  richJap(input) {
    return input === undefined ? new AIRich(this.client) : createRich(this.client, input)
  }

  /** One-liner rich helper: `jap.rich({ markdown: '# Hi' }).send(jid)`. */
  rich(input = {}) {
    return createRich(this.client, input)
  }

  /** Short JAP-branded one-liner alias: `jap.jap('# Hi').send(jid)`. */
  jap(input = {}) {
    return createRich(this.client, input)
  }

  /** One-liner rich sender: `await jap.sendRich(jid, { text: 'Hi' })`. */
  sendRich(jid, input = {}, options = {}) {
    return sendRich(this.client, jid, input, options)
  }

  /** JAP-branded sender alias: `await jap.sendJapRich(jid, { text: 'Hi' })`. */
  sendJapRich(jid, input = {}, options = {}) {
    return sendRich(this.client, jid, input, options)
  }

  // ===== BUTTON =====

  button() {
    return new Button(this.client)
  }

  buttonV2() {
    return new ButtonV2(this.client)
  }

  buttonV3() {
    return new ButtonV3(this.client)
  }

  // ===== CAROUSEL =====

  carousel() {
    return new Carousel(this.client)
  }

  // ===== POLL =====

  poll() {
    return new Poll(this.client)
  }

  // ===== A2UI / BLOKS =====

  a2ui() {
    return new A2UI()
  }

  /**
   * PascalCase aliases for developers who prefer class-style naming.
   */
  AIRich() {
    return this.airich()
  }

  Rich(input = {}) {
    return this.rich(input)
  }

  JapRich(input = {}) {
    return this.jap(input)
  }

  Button() {
    return this.button()
  }

  Carousel() {
    return this.carousel()
  }

  Poll() {
    return this.poll()
  }

  A2UI() {
    return this.a2ui()
  }
}

export { JapBaileys }
