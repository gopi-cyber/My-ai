# Design System: AETHER Autonomous Daemon Dashboard
**Project ID:** 781888674931311613

## 1. Visual Theme & Atmosphere
The Creative North Star for this design system is **"The Quantum Architect."** 

It is a cinematic, high-fidelity lens into a sentient machine. The design emphasizes depth, atmospheric lighting, and intentional asymmetry. The UI floats in an obsidian void, defined by light and shadow rather than rigid borders.

## 2. Color Palette & Roles
*   **Obsidian Base (#050508):** Use for the root background.
*   **Shadow Surface (#131317):** Primary container background.
*   **Primary Accent - Violet (#6366F1 / #c0c1ff):** Interactive highlights, primary CTAs, and critical data paths.
*   **Secondary Accent - Cyan (#06B6D4):** Status indicators and secondary metrics.
*   **Tertiary Accent - Amethyst (#A855F7):** Luxury flourishes and AI reasoning highlights.
*   **True North Text (#e5e1e7):** Default readable text (preventing pure white eye strain).

## 3. Typography Rules
*   **Display & Headlines (Space Grotesk):** Architectural voice. Wide character set.
*   **System Data & Code (JetBrains Mono):** Precision metrics and AI output.
*   **Body & UI (Manrope):** Functional labels and buttons.
*   **Contrast Rule:** Pair `headline-sm` (Space Grotesk) with `label-md` (JetBrains Mono).

## 4. Component Stylings
*   **Buttons:** 
    *   Primary: Gradient fill (Violet to Deep Amethyst), 0.375rem radius.
    *   Secondary: Ghost style, 20% opacity outline variant.
*   **Cards/Containers:** 
    *   Glass Cards: 60% opacity, 12px backdrop-blur, 0.5rem radius.
    *   No-Line Rule: Boundaries defined by tonal shifts, not 1px borders.
*   **Inputs/Forms:** 
    *   Style: Tonal block fill (surface_container_low).
    *   Active: Violet glow shadow.

## 5. Layout Principles
*   **Spacing Strategy:** Use 12px vertical gaps to separate list items instead of divider lines.
*   **Grid:** Strict technical grids for data mixed with asymmetric "overlap" for hero visualizations.
*   **Transitions:** All animations use `--ease-liquid: cubic-bezier(0.4, 0, 0.2, 1);`.
