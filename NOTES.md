# Anion lab — working notes (survives compaction)

Sources
- Slides (read-only): C:\Users\freef\Desktop\New folder\L1Analytical_Chem_I\Lec {1,2,3} (Anions).pdf
  - text dumps: src/text/L0{1,2,3}.txt ; slide PNGs: src/img/L0x_sNN.png ; 2-up: src/pairs
  - L01 = 35 slides (Groups I–II), L02 = 30 (III–IV), L03 = 23 (V–VI)
- Walkthrough doc: Claude Docs 518a3d35-77fc-40a5-bca0-b5286e0c5333, body node d5a3833e-1901
  - corrections table block m7p52cx9w95.30357 (9 rows), notes list .31671 (Cu²⁺ vs Cu⁺; CrO₈³⁻ vs CrO₅)

Doc corrections (slide → correct)
1. L01 s17  2 BaNO₃ · 2 CaNO₃ · 2 MgNO₃ → Ba(NO₃)₂ · Ca(NO₃)₂ · Mg(NO₃)₂
2. L01 s21  2MnO₄⁻ + 5S₂O₃²⁻ + 14H⁺ → 2Mn²⁺ + 10SO₄²⁻ + 7H₂O → 8MnO₄⁻ … 8Mn²⁺
3. L01 s22  Cr₂O₇²⁻ + 3S₂O₃²⁻ + 26H⁺ → 2Cr³⁺ + 3SO₄²⁻ + 13H₂O → 4Cr₂O₇²⁻ + 3S₂O₃²⁻ + 26H⁺ → 8Cr³⁺ + 6SO₄²⁻ + 13H₂O
4. L01 s24  solubility box (sulphide rule vs BaSO₃ s29) — not an equation
5. L01 s28  Ag₂SO₃ →boil SO₂ + 2Ag₂SO₄²⁻ + 2Ag⁰ → 2Ag₂SO₃ → 2Ag⁰↓ + Ag₂SO₄ + SO₂↑
6. L01 s34  Na₂SO₄ + C → Na₂S + 4CO → Na₂SO₄ + 4C → Na₂S + 4CO
7. L02 s10  AgX + S₂O₃²⁻ → [Ag(S₂O₃)₂]³⁻ + X⁻ → AgX + 2S₂O₃²⁻
8. L02 s15  "yellow ppt. of sodium chromate" → yellow solution of Na₂CrO₄
9. L03 s12  AsO₄³⁻ + 2I⁻ + 4H⁺ → AsO₃⁻ + I₂ + 2H₂O → AsO₄³⁻ + 2H⁺ + 2I⁻ ⇌ AsO₃³⁻ + H₂O + I₂

Extra unbalanced slide equations I found (NOT in the doc → flag.source = "extra", labelled زيادة)
- L01 s10  Ca(HCO₃)₂ + 2HCl → CaCl₂ + CO₂ + 2H₂O  (needs 2CO₂)
- L01 s16  AgHCO₃ →boil Ag₂CO₃ + CO₂ + H₂O        (needs 2AgHCO₃)
- L01 s17  2HCO₃⁻ + MgSO₄ → Mg(HCO₃)₂ + 2SO₄²⁻    (needs 1 SO₄²⁻)
- L01 s32  ZnSO₄ + Na₂[Fe(CN)₅NO] + SO₃²⁻ → ZnNa₂[Fe(CN)₅NOSO₃]  (SO₄²⁻ missing)

Acceptance tests vs slides: all 12 consistent with slides (checked in Phase 1).

Tooling: no system Python → use `uv run --no-project --with <pkg> python -I`. Node 24 available.
Playwright NOT preinstalled in workspace (prompt said it was) → plan: npm i playwright-core, use system Edge/Chrome.

Design decision: UI chrome is monochrome ink/paper; the only hues on screen are reaction colors.
