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
  secondary?: OverlayAction;
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

    const secondary = spec.secondary ?? {
      label: "모드 선택",
      action: this.onDefaultSecondary,
    };
    this.secondaryBtn.textContent = secondary.label;
    this.secondaryBtn.onclick = () => {
      this.close();
      secondary.action();
    };
    this.root.classList.remove("hidden");
  }

  close(): void {
    this.root.classList.add("hidden");
  }
}
