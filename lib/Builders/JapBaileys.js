import { AIRich } from './AIRich.js'
import { createRich, sendRich, sendJapRich } from './Rich.js'
import { Button } from './Button.js'
import { ButtonV2 } from './ButtonV2.js'
import { ButtonV3 } from './ButtonV3.js'
import { Carousel } from './Carousel.js'
import { Poll } from './Poll.js'
import { A2UI } from './A2UI.js'
import { sendButtons, sendInteractiveMessage, sendInteractiveMessageV2 } from '../Utils/button-sender.js'
import { sendMiniApp } from '../Utils/mini-app.js'
import { sendA2UI, sendBloksWidget } from './a2ui-fn.js'

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

  /**
   * JAP@Add (§2.87) --- the socket-bound form: every `sendX(sock, …)` helper becomes a
   * method on the socket itself, plus a `mb` handle for the builders.
   *
   * ```js
   * MessageBuilder.bind(sock)        // or MB.bind(sock)
   * await sock.sendButton(jid, { text: 'Hi', buttons })
   * sock.mb.carousel().addCard(…)
   * ```
   *
   * Nothing is overwritten: a name the socket already defines is skipped and reported, so
   * binding can never shadow a core method. The return value is an unbind function, and
   * `bound`/`skipped` list what happened.
   */
  static bind(sock, { prefix = '', overwrite = false } = {}) {
    if (!sock || typeof sock.sendMessage !== 'function') {
      throw new TypeError('MessageBuilder.bind(sock) requires an active Baileys socket')
    }
    const hub = new JapBaileys(sock)
    const methods = {
      sendButton: (jid, data, options) => sendButtons(sock, jid, data, options),
      sendButtons: (jid, data, options) => sendButtons(sock, jid, data, options),
      sendInteractive: (jid, content, options) => sendInteractiveMessage(sock, jid, content, options),
      sendInteractiveV2: (jid, content, options) => sendInteractiveMessageV2(sock, jid, content, options),
      sendRich: (jid, input, options) => sendRich(sock, jid, input, options),
      sendJapRich: (jid, input, options) => sendJapRich(sock, jid, input, options),
      sendMini: (jid, miniApp, options) => sendMiniApp(sock, jid, miniApp, options),
      sendA2UI: (jid, tree, options) => sendA2UI(sock, jid, tree, options),
      sendBloks: (jid, widget, options) => sendBloksWidget(sock, jid, widget, options)
    }
    const bound = []
    const skipped = []
    const restore = new Map()
    for (const [name, fn] of Object.entries(methods)) {
      const key = prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name
      if (key in sock && !overwrite) {
        skipped.push(key)
        continue
      }
      restore.set(key, key in sock ? sock[key] : undefined)
      sock[key] = fn
      bound.push(key)
    }
    const mbKey = prefix ? `${prefix}Mb` : 'mb'
    if (!(mbKey in sock) || overwrite) {
      restore.set(mbKey, sock[mbKey])
      sock[mbKey] = hub
      bound.push(mbKey)
    }
    else {
      skipped.push(mbKey)
    }
    const unbind = () => {
      for (const [key, previous] of restore) {
        if (previous === undefined) {
          delete sock[key]
        }
        else {
          sock[key] = previous
        }
      }
      restore.clear()
      return true
    }
    unbind.bound = bound
    unbind.skipped = skipped
    unbind.hub = hub
    return unbind
  }

  /** Instance form of {@link JapBaileys.bind}: binds to the client it was built with. */
  bind(options = {}) {
    return JapBaileys.bind(this.client, options)
  }
}

export { JapBaileys }
