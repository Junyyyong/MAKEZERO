import { el } from "../dom";

export interface OverlayAction {
  label: string;
  action: () => void;
}

export interface OverlaySpec {
  title: string;
  body: string;
  /** Set when the body carries markup rather than plain text. */
  html?: boolean;
  primary: OverlayAction;
  /** Omit for the default way out; `null` for a panel with one button. */
  secondary?: OverlayAction | null;
}

/** The full-screen panel used for results, and for the rules. */
export class Overlay {
  private readonly root = el<HTMLDivElement>("overlay");
  private readonly titleEl = el<HTMLHeadingElement>("overlay-title");
  private readonly bodyEl = el<HTMLParagraphElement>("overlay-body");
  private readonly primaryBtn = el<HTMLButtonElement>("btn-primary");
  private readonly secondaryBtn = el<HTMLButtonElement>("btn-secondary");

  constructor(private readonly onDefaultSecondary: () => void) {}

  get isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  open(spec: OverlaySpec): void {
    this.titleEl.textContent = spec.title;
    if (spec.html) this.bodyEl.innerHTML = spec.body;
    else this.bodyEl.textContent = spec.body;

    this.primaryBtn.textContent = spec.primary.label;
    this.primaryBtn.onclick = () => {
      this.close();
      spec.primary.action();
    };

    // Omitting `secondary` gets the way out every panel needs; passing null
    // says this panel genuinely has one button, which the rules do — they sit
    // on top of whatever was happening, so closing them puts it back.
    const secondary =
      spec.secondary === null
        ? null
        : (spec.secondary ?? { label: "Menu", action: this.onDefaultSecondary });
    this.secondaryBtn.classList.toggle("hidden", secondary === null);
    if (secondary) {
      this.secondaryBtn.textContent = secondary.label;
      this.secondaryBtn.onclick = () => {
        this.close();
        secondary.action();
      };
    }
    this.root.classList.remove("hidden");
  }

  close(): void {
    this.root.classList.add("hidden");
  }
}
