# save as detour_unified_bg.py
import cv2, numpy as np, pathlib, sys

def _estimate_bg_lab(img_bgr, border=20):
    """Estimate background color from image borders (median in LAB)."""
    h, w = img_bgr.shape[:2]
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)

    mask = np.zeros((h, w), np.uint8)
    mask[:border, :] = 1
    mask[-border:, :] = 1
    mask[:, :border] = 1
    mask[:, -border:] = 1

    samples = lab[mask == 1].reshape(-1, 3)
    median = np.median(samples, axis=0)
    return median  # LAB median

def detour_unified_bg(path, out_path=None, bg_percentile=96, margin=8.0,
                      grabcut_iters=5, feather_sigma=1.5, border_px=20):
    """
    Remove near-flat background with small variance.

    - bg_percentile: how tolerant we are to background variation (higher -> more tolerant)
    - margin: extra LAB distance above background threshold to seed 'sure foreground'
    - feather_sigma: Gaussian blur sigma for alpha edges (0 to disable)
    - border_px: border width used for background color estimation
    """
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise FileNotFoundError(path)
    h, w = bgr.shape[:2]

    bg_lab = _estimate_bg_lab(bgr, border=border_px)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)

    # LAB distance from each pixel to the estimated background color
    dist = np.linalg.norm(lab - bg_lab, axis=2)

    # Compute a robust threshold from the border distances
    border_mask = np.zeros((h, w), np.uint8)
    border_mask[:border_px, :] = 1
    border_mask[-border_px:, :] = 1
    border_mask[:, :border_px] = 1
    border_mask[:, -border_px:] = 1
    bg_thr = float(np.percentile(dist[border_mask == 1], bg_percentile))

    # Seeds for GrabCut
    sure_bg = dist <= bg_thr
    sure_fg = dist >= (bg_thr + margin)

    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    mask[sure_bg] = cv2.GC_BGD
    mask[sure_fg] = cv2.GC_FGD

    bgdModel = np.zeros((1, 65), np.float64)
    fgdModel = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, None, bgdModel, fgdModel, grabcut_iters, cv2.GC_INIT_WITH_MASK)

    # Binary cutout (foreground = 1)
    cut = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)

    # Small cleanups
    cut = cv2.morphologyEx(cut, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    cut = cv2.morphologyEx(cut, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)

    # Alpha channel with optional feathering
    alpha = (cut * 255).astype(np.uint8)
    if feather_sigma and feather_sigma > 0:
        alpha = cv2.GaussianBlur(alpha, (0, 0), feather_sigma)

    # Compose BGRA and save
    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = alpha

    out_path = out_path or str(pathlib.Path(path).with_suffix(".png"))
    cv2.imwrite(out_path, bgra)
    return out_path

if __name__ == "__main__":
    paths = sys.argv[1:]
    if not paths:
        print("Usage:\n  python detour_unified_bg.py IMG1 [IMG2 ...]\n\nTips:\n  - If the subject leaks, increase 'margin' or lower 'bg_percentile'.\n  - Jagged edges? Increase 'feather_sigma' (e.g. 2.0–3.0).")
        raise SystemExit(1)
    for p in paths:
        print(detour_unified_bg(p))
