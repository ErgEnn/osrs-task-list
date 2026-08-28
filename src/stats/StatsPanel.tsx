import { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/Icon';
import { STATUS_LABELS, STATUSES, type Status } from '@/domain/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { summarizePlayer, type DiaryStat, type PlayerStats } from './playerStats';
import { useStatsStore } from './statsStore';
import './stats.css';

function ago(timestamp: number | null): string {
  if (!timestamp) return 'never';
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute(s) ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hour(s) ago` : new Date(timestamp).toLocaleDateString();
}

/**
 * Everything the WikiSync profile knows about the character, read-only:
 * skills, combat and total level, quest states, achievement diaries and the
 * combat-achievement count. Toggled from the toolbar; the profile is cached in
 * the stats store so reopening does not refetch.
 */
export function StatsPanel() {
  const open = useUiStore((s) => s.statsOpen);
  const setStatsOpen = useUiStore((s) => s.setStatsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const username = useSettingsStore((s) => s.username);
  const player = useStatsStore((s) => s.player);
  const loading = useStatsStore((s) => s.loading);
  const error = useStatsStore((s) => s.error);
  const fetchedAt = useStatsStore((s) => s.fetchedAt);
  const load = useStatsStore((s) => s.load);

  useEffect(() => {
    if (open) void load();
  }, [open, username, load]);

  const stats = useMemo(() => (player ? summarizePlayer(player) : null), [player]);

  if (!open) return null;

  return (
    <aside className="stats osrs-panel" aria-label="Player stats">
      <h2 className="osrs-panel__title">
        {stats?.username || username.trim() || 'Player stats'}
        <button
          type="button"
          className="osrs-modal__x"
          aria-label="Close player stats"
          onClick={() => setStatsOpen(false)}
        >
          ✕
        </button>
      </h2>

      <div className="stats__bar">
        <span className="stats__note">Last read: {ago(fetchedAt)}</span>
        <button
          type="button"
          className="osrs-btn stats__refresh"
          disabled={loading || !username.trim()}
          onClick={() => void load(true)}
        >
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </div>

      <div className="stats__body">
        {error && (
          <p className="stats__error">
            {error}
            {!username.trim() && (
              <>
                {' '}
                <button type="button" className="stats__link" onClick={() => setSettingsOpen(true)}>
                  Open settings
                </button>
              </>
            )}
          </p>
        )}
        {!stats && loading && <p className="stats__note">Reading WikiSync…</p>}
        {stats && <StatsContent stats={stats} />}
      </div>
    </aside>
  );
}

function StatsContent({ stats }: { stats: PlayerStats }) {
  return (
    <>
      <section className="stats__section">
        <h3 className="stats__heading">Skills</h3>
        <div className="stats__skills">
          {stats.skills.map(({ skill, level, reported }) => (
            <div
              key={skill}
              className={clsx('stats__skill', !reported && 'stats__skill--unreported')}
              title={reported ? `${skill} ${level}` : `${skill} — not reported by WikiSync`}
            >
              <Icon iconRef={{ kind: 'builtin', id: `skill:${skill.toLowerCase()}` }} size={20} />
              <span className="stats__skill-level">{level}</span>
            </div>
          ))}
          <div className="stats__skill stats__skill--total" title="Total level">
            <span className="stats__skill-label">Total</span>
            <span className="stats__skill-level">{stats.totalLevel}</span>
          </div>
        </div>
        <p className="stats__note">Combat level {stats.combatLevel}</p>
      </section>

      <section className="stats__section">
        <h3 className="stats__heading">
          Quests{' '}
          <span className="stats__count">
            {stats.questCounts.done}/{stats.questCounts.total}
          </span>
        </h3>
        {stats.questCounts.total === 0 ? (
          <p className="stats__note">No quest data reported.</p>
        ) : (
          STATUSES.map((status) => <QuestGroup key={status} status={status} stats={stats} />)
        )}
      </section>

      <section className="stats__section">
        <h3 className="stats__heading">
          Achievement diaries{' '}
          <span className="stats__count">
            {stats.diaryCounts.done}/{stats.diaryCounts.total}
          </span>
        </h3>
        {stats.diaries.length === 0 ? (
          <p className="stats__note">No diary data reported.</p>
        ) : (
          <ul className="stats__list">
            {stats.diaries.map((diary) => (
              <DiaryRow key={diary.region} diary={diary} />
            ))}
          </ul>
        )}
      </section>

      <section className="stats__section">
        <h3 className="stats__heading">Combat achievements</h3>
        <p className="stats__note">
          {stats.combatAchievements === null
            ? 'Not reported.'
            : `${stats.combatAchievements} task(s) complete`}
        </p>
      </section>
    </>
  );
}

/** One collapsible quest group; only the unfinished ones start open. */
function QuestGroup({ status, stats }: { status: Status; stats: PlayerStats }) {
  const quests = stats.quests.filter((quest) => quest.status === status);
  if (quests.length === 0) return null;
  return (
    <details className="stats__group" open={status === 'inprogress'}>
      <summary className={clsx('stats__group-summary', `stats__status--${status}`)}>
        {STATUS_LABELS[status]} <span className="stats__count">{quests.length}</span>
      </summary>
      <ul className="stats__list">
        {quests.map((quest) => (
          <li key={quest.name} className={clsx('stats__row', `stats__status--${status}`)}>
            {quest.name}
          </li>
        ))}
      </ul>
    </details>
  );
}

function DiaryRow({ diary }: { diary: DiaryStat }) {
  return (
    <li className="stats__row stats__row--diary">
      <span className="stats__region">{diary.region}</span>
      <span className="stats__tiers">
        {diary.tiers.map((tier) => (
          <span
            key={tier.tier}
            className={clsx('stats__tier', tier.complete && 'stats__tier--done')}
            title={
              tier.total > 0
                ? `${diary.region} ${tier.tier}: ${tier.done}/${tier.total} task(s)`
                : `${diary.region} ${tier.tier}: ${tier.complete ? 'complete' : 'incomplete'}`
            }
          >
            {tier.tier.slice(0, 2)}
          </span>
        ))}
      </span>
    </li>
  );
}
