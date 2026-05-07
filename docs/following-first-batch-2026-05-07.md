# Following Import First Batch - 2026-05-07

Source: local following export `twitter-Junhua_Yao13-following.csv`.

This document records the first curated import only. The full 300-account export is not committed to this repository.

## Dry Run Summary

- CSV rows: 300
- Existing registry matches: 2
- Potential additions: 298
- Rough categories from the import classifier:
  - research: 161
  - builder: 35
  - following: 102

## Enabled First Batch

These accounts are enabled immediately with `routeTo: ["builders", "research_x"]`.

| Handle | Priority | Tags | Rationale |
|---|---|---|---|
| theo_gervet | P1 | embodied-ai, robotics, builder | Genesis AI / Skild / robotics builder signal |
| gs_ai_ | P1 | embodied-ai, robotics | Genesis AI company feed |
| KnightNemo_ | P1 | embodied-ai, world-models, humanoid | world models / humanoid foundation models |
| frankzydou | P1 | embodied-ai, robotics, simulation | MIT CSAIL robotics / simulation |
| younghyo_park | P1 | embodied-ai, robotics | MIT CSAIL robotics |
| yacineMTB | P1 | embodied-ai, rl, robotics, builder | RL + robots + builder signal |
| 1x_tech | P1 | embodied-ai, robotics, humanoid | humanoid robotics company feed |
| NVIDIARobotics | P1 | embodied-ai, robotics, ai-lab | physical AI / robotics platform signal |
| soniajoseph_ | P1 | world-models, interpretability | interpretable video world models |
| ayaannmalik | P1 | embodied-ai, world-models | embodied AI / world models |
| EkaRobotics | P1 | embodied-ai, robotics | robotics company feed |
| sundayrobotics | P1 | embodied-ai, robotics | robotics company feed |
| priyasun_ | P1 | embodied-ai, robot-learning | robot learning from humans |
| robotsdigest | P2 | embodied-ai, robotics, news | robotics aggregation, useful but noisy |
| fdellaert | P1 | robotics, computer-vision | robotics and computer vision research |
| BitRobotNetwork | P2 | embodied-ai, robotics, news | embodied AI aggregation, useful but noisy |
| pabbeel | P1 | robot-learning, rl | Berkeley robot learning |
| percyliang | P2 | ai-research, evaluation | AI research / evaluation |
| lilianweng | P1 | ai-research, robotics, ai-lab | AI research, safety, robotics background |
| ch402 | P2 | interpretability, ai-safety | interpretability / safety |
| bcherny | P1 | agent, tooling | Claude Code / agent workflow signal |
| DarioAmodei | P1 | agent, ai-lab | Anthropic strategy and agent direction |
| AnthropicAI | P1 | agent, ai-lab, ai-safety | Anthropic product/research feed |
| GoogleAIStudio | P1 | agent, tooling, ai-lab | Gemini tooling / production API signal |
| ClementDelangue | P2 | open-source, ai-lab, agent | Hugging Face ecosystem signal |

## Guardrails

- Do not bulk-enable the full following export.
- New accounts from future CSV imports should default to `enabled: false`.
- Use one week of Builders Digest output to decide whether to demote noisy aggregators such as `robotsdigest` and `BitRobotNetwork`.
