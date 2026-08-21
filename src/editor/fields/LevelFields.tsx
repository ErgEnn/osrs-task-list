import { SKILLS, type Skill } from '@/domain/skills';

interface Props {
  skill: Skill;
  level: number;
  onChange: (skill: Skill, level: number) => void;
}

export function LevelFields({ skill, level, onChange }: Props) {
  return (
    <div className="form-row form-row--inline">
      <label className="form-row">
        <span className="form-row__label">Skill</span>
        <select
          className="osrs-select"
          value={skill}
          onChange={(e) => onChange(e.target.value as Skill, level)}
        >
          {SKILLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="form-row">
        <span className="form-row__label">Level (1–99)</span>
        <input
          type="number"
          className="osrs-input"
          min={1}
          max={99}
          value={level}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChange(skill, Math.max(1, Math.min(99, Number.isFinite(parsed) ? parsed : 1)));
          }}
        />
      </label>
    </div>
  );
}
