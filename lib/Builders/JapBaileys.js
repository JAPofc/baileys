import { AIRich } from './AIRich.js'
import { Button } from './Button.js'
import { ButtonV2 } from './ButtonV2.js'
import { ButtonV3 } from './ButtonV3.js'
import { Carousel } from './Carousel.js'
import { Poll } from './Poll.js'
import { A2UI } from './A2UI.js'

/**
 * JapBaileys — unified builder hub.
 *
 * Semua builder tetap berada di class/file masing-masing.
 * Class ini hanya menyediakan satu pintu masuk.
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

  japRich() {
    return new AIRich(this.client)
  }

  richJap() {
    return new AIRich(this.client)
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
   * Alias PascalCase untuk developer yang suka naming class.
   */
  AIRich() {
    return this.airich()
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
