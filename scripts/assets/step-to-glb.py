"""STEP → GLB thô bằng OpenCascade native (gói cascadio).

    python -m pip install cascadio
    python step-to-glb.py <file.step> <raw.glb>

Sau đó chạy optimize-glb.mjs để nén cho web. (occt-import-js bản WASM không tam giác hoá
được file STEP 50 MB của Allegro, nên bước này dùng bản native.)
"""
import sys

import cascadio

if len(sys.argv) != 3:
    sys.exit("Cách dùng: python step-to-glb.py <file.step> <raw.glb>")

# Sai số 0,01 mm: đủ mịn cho chân IC 0,5 mm pitch mà file không phình
code = cascadio.step_to_glb(
    sys.argv[1], sys.argv[2], tol_linear=0.01, tol_angular=0.5, tol_relative=False, merge_primitives=True, use_parallel=True
)
sys.exit(code)
