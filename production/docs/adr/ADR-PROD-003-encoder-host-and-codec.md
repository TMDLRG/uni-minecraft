# ADR-PROD-003 - Encoder host and codec: dedicated broadcast node, x264 default, NVENC/VAAPI when present

> **⚠️ SUPERSEDED-IN-PART BY [ADR-PROD-012](ADR-PROD-012-encoder-placement-policy.md) (2026-07-12).**
> The **never-on-ERP** invariant and the **x264 `faster` 720p30 codec floor** are unchanged and remain
> authoritative. The *host classification* rule ("a dedicated Linux broadcast node") was too narrow —
> encoder placement follows the physical GPU, not the OS. Under the current fleet the qualifying host is
> **THINKER** (Windows, NVIDIA T1000, non-ERP). L1 `uni-lab` is still forbidden. Read ADR-PROD-012 before
> treating this ADR's host-classification section as deployment guidance.

- **Status:** Superseded-in-part
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` ("the one architecture-shaping constraint"; GAP G-ENC)

## Context

The UNI Lab appliance (the Dell PowerEdge that hosts `/glass`, the uni-lab MCP, and the **protected business
stack** - `solutionwright-odoo` ERP, Jitsi, cloudflared, portainer) has a **Matrox G200: no 3D, no hardware
video encode** (observed 2026-06-21 from `lab-os/systemd/uni-cockpit-kiosk.service`, which runs
`chromium --disable-gpu`; and from the ingest map - no `nvidia` / `--gpus` / CDI passthrough anywhere). A
broadcast of **4 h x 3/day** H.264 encoded in **x264 software** on that box would load its CPU heavily and
put the mission-critical ERP at risk. The Epistemic Charter forbids stressing the business stack (read-only,
never a mutation target, never stressed).

So the encoder host and codec are an architecture-shaping decision, and the exact encode hardware is not yet
chosen - that gap is **G-ENC**.

## Decision

The broadcast **encoder/mixer runs on a dedicated UNI.OS broadcast node**, **not** co-located with the ERP
appliance. The node runs the **same UNI.OS image + rootful-Podman + quadlet pattern** (identical stack), and
adds a cheap **NVENC/VAAPI-capable GPU**. The quadlets are **host-portable** and **encoder-parameterised**:

- `x264` **software is the zero-GPU default** and the honest floor (design floor: 720p30, x264 `faster`).
- `h264_nvenc` engages on an NVIDIA node via CDI: `PodmanArgs=--device nvidia.com/gpu=all`.
- `h264_vaapi` engages on a `/dev/dri` node: `PodmanArgs=--device /dev/dri`.

The appliance keeps serving `/glass` and the MCP/approval control plane; the broadcast node does the heavy
lifting. The NVIDIA **T1000** on the ComfyUI dev box is only a *candidate* NVENC node; since the brief is to
move **off** the dev box, a dedicated node is the target. The exact node + GPU is an operator hardware
choice - **GAP G-ENC** (`pending_hardware`); until chosen the design encodes 720p30 x264 `faster`.

## Alternatives considered

- **Encode on the ERP appliance in x264 software.** Rejected - **forbidden by the charter**: a sustained
  4 h x 3/day software encode would stress the box that runs the mission-critical ERP. This is the decision's
  whole reason to exist.
- **Encode on the ComfyUI dev box (T1000 NVENC).** Rejected as the target: the brief is to move **off** the
  dev box and not stress it; the T1000 is recorded only as a candidate node for evaluation.
- **NVENC-only / require a GPU.** Rejected: it makes the platform undeployable without specific hardware.
  x264 software default keeps the floor honest and lets the node be any UNI.OS host; GPU paths are an
  opt-in acceleration, selected by quadlet parameter.
- **Cloud transcode (encode in a managed service).** Rejected on free/open + on-appliance constraints and
  the audit/approval model.

## Consequences

- The encoder is **not** co-located with the protected business stack, honoring the charter's "do not stress
  the business stack" and "do not co-locate the encoder with the ERP appliance." Honest tradeoff: it
  requires a **second physical/virtual node** the operator must provision - **G-ENC** stays open until that
  hardware exists.
- Host-portable, encoder-parameterised quadlets mean the same artifacts run x264-only or GPU-accelerated with
  no code change - only a parameter and a `--device` arg differ.
- The "encoder isolated from the ERP" property is an **isolation claim** and is therefore **Class-Sec /
  pending** under the charter: it is a design intent, **unproven** until a captured run shows the encode load
  living on the broadcast node and not touching the appliance. (We deliberately do **not** call it
  "isolated" as an unqualified word.)
- Evidence class: "no hardware encode on the appliance" is **Class-C** (command/file output captured this
  session); "encode runs on a separate node without stressing the ERP" is **pending_hardware** (G-ENC).

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Observed: `lab-os/systemd/uni-cockpit-kiosk.service` (chromium `--disable-gpu`), the ingest map
- Related: ADR-PROD-001 (OBS mixer it encodes from), ADR-PROD-008 (relay copy-fan-out, one encode)
- Gap: `production/docs/GAPS_REGISTER.md` row G-ENC
- Quadlet: `production/containers/systemd/uni-bcast-mixer.container` (encoder param)

## Status (honest)

This ADR is a **design**, status `pending`; nothing is deployed. No banned-unqualified word is used as a
claim. "No hardware encode on the appliance" is **Class-C** as captured 2026-06-21; the dedicated-node +
non-co-location property is an isolation claim, **Class-Sec / pending_hardware** (G-ENC) until a captured
run. The business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is **never** a mutation
target and is **not** co-located with the encoder; the producer agent **cannot self-approve**.
