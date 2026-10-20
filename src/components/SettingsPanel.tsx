"use client";

import { useId, useState } from "react";
import { PageTitle, SectionLabel } from "./AppShell";
import { announce } from "./Announcer";
import { PRACTICE_LEVELS, STANDARD_RULES, difficultyFor } from "@/lib/game/rules";
import { formatDuration } from "@/lib/game/scoring";
import { speechSupported } from "@/lib/media";
import { DISPLAY_NAME_PATTERN, type Settings } from "@/lib/storage/schema";
import { updateSettings, useStoredData } from "@/lib/storage/store";
import { useClientValue } from "@/lib/valueStore";

function save(patch: Partial<Settings>, message = "Saved.") {
  updateSettings(patch);
  announce(message);
}

function RadioGroup<T extends string>({
  legend,
  description,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  description?: React.ReactNode;
  name: string;
  value: T;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-rule py-6 md:grid-cols-12" aria-describedby={description ? `${id}-d` : undefined}>
      <div className="md:col-span-4">
        <legend className="float-left font-semibold">{legend}</legend>
        {description ? (
          <p id={`${id}-d`} className="clear-left pt-1 text-small text-ink-2">
            {description}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 md:col-span-8 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-12 cursor-pointer items-start gap-3 border p-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
              o.disabled ? "cursor-not-allowed border-dashed border-line text-ink-2" : "border-line"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
            />
            <span>
              <span className="block font-medium">{o.label}</span>
              {o.hint ? <span className="block text-small text-ink-2">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Switch({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-rule py-6 md:grid-cols-12">
      <div className="md:col-span-4">
        <p id={`${id}-l`} className="font-semibold">
          {label}
        </p>
        <p id={`${id}-d`} className="pt-1 text-small text-ink-2">
          {description}
        </p>
      </div>
      <div className="md:col-span-8">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={`${id}-l`}
          aria-describedby={`${id}-d`}
          onClick={() => onChange(!checked)}
          className="inline-flex min-h-12 items-center gap-3 border border-line px-3 hover:border-ink"
        >
          <span className={`relative inline-block h-6 w-11 border border-ink ${checked ? "bg-ink" : "bg-canvas"}`} aria-hidden="true">
            <span
              className={`absolute top-0.5 size-[1.125rem] transition-[left] ${checked ? "left-[1.375rem] bg-canvas" : "left-0.5 bg-ink"}`}
            />
          </span>
          <span className="num text-small">{checked ? "On" : "Off"}</span>
        </button>
      </div>
    </div>
  );
}

function NameField({ initial }: { initial: string }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim().replace(/\s+/g, " ");
    if (v !== "" && !DISPLAY_NAME_PATTERN.test(v)) {
      setError("Use 2 to 20 letters, numbers, spaces, dots, dashes or underscores, or leave it empty.");
      setSaved(false);
      return;
    }
    setError(null);
    setValue(v);
    save({ displayName: v }, v ? "Name saved." : "Name cleared.");
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-rule py-6 md:grid-cols-12">
      <div className="md:col-span-4">
        <label htmlFor={`${id}-n`} className="font-semibold">
          Leaderboard name
        </label>
        <p id={`${id}-h`} className="pt-1 text-small text-ink-2">
          Shown when you post a daily score.
        </p>
      </div>
      <div className="md:col-span-8">
        <div className="flex max-w-md gap-2">
          <input
            id={`${id}-n`}
            value={value}
            maxLength={20}
            autoComplete="nickname"
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-h${error ? ` ${id}-e` : ""}`}
            className="min-h-12 min-w-0 flex-1 border border-line bg-surface px-3 aria-[invalid=true]:border-2 aria-[invalid=true]:border-signal"
          />
          <button type="submit" className="btn btn-secondary">
            Save
          </button>
        </div>
        {error ? (
          <p id={`${id}-e`} className="mt-2 text-small font-medium text-signal">
            <span aria-hidden="true">Error: </span>
            {error}
          </p>
        ) : saved ? (
          <p className="mt-2 text-small text-ink-2">Saved.</p>
        ) : null}
      </div>
    </form>
  );
}

export function SettingsPanel() {
  const data = useStoredData();
  const canSpeak = useClientValue(speechSupported);

  if (!data) {
    return <p className="pt-16 text-ink-2">Reading settings.</p>;
  }
  const s = data.settings;

  return (
    <div>
      <PageTitle eyebrow="Preferences">Settings</PageTitle>
      <p className="mt-3 max-w-[40rem] text-ink-2">Changes save as you make them and stay in this browser.</p>

      <section aria-labelledby="play-heading" className="mt-10 border-t border-ink pt-5">
        <SectionLabel id="play-heading">
          Play
        </SectionLabel>
        <div className="mt-4">
          <RadioGroup
            legend="Presentation"
            name="presentation"
            value={s.presentation}
            onChange={(v) => save({ presentation: v })}
            description={
              <>
                Spoken says each token aloud. It is ranked in its own division.
                {canSpeak === false ? " This browser cannot speak, so it is unavailable here." : ""}
              </>
            }
            options={[
              { value: "visual", label: "Visual", hint: "Standard division" },
              { value: "spoken", label: "Spoken", hint: "Spoken division", disabled: canSpeak === false },
            ]}
          />
          <RadioGroup
            legend="Practice level"
            name="practiceLevel"
            value={s.practiceLevel}
            onChange={(v) => save({ practiceLevel: v })}
            description="Where practice runs start. The daily challenge always starts at the beginning."
            options={PRACTICE_LEVELS.map((l) => {
              const d = difficultyFor(STANDARD_RULES, l.offset);
              return { value: l.id, label: l.label, hint: `${d.length} tokens at ${formatDuration(d.durationMs)}` };
            })}
          />
          <Switch
            label="Start screen before practice"
            description="Show a short prompt before each practice run. When off, Play goes straight to the countdown."
            checked={!s.rulesSeen}
            onChange={(on) => save({ rulesSeen: !on })}
          />
        </div>
      </section>

      <section aria-labelledby="display-heading" className="mt-10 border-t border-ink pt-5">
        <SectionLabel id="display-heading">
          Display and sound
        </SectionLabel>
        <div className="mt-4">
          <RadioGroup
            legend="Theme"
            name="theme"
            value={s.theme}
            onChange={(v) => save({ theme: v })}
            options={[
              { value: "system", label: "System", hint: "Follow the device" },
              { value: "light", label: "Light", hint: "Ivory canvas" },
              { value: "dark", label: "Dark", hint: "Near-black canvas" },
            ]}
          />
          <RadioGroup
            legend="Motion"
            name="motion"
            value={s.motion}
            onChange={(v) => save({ motion: v })}
            description="Reduce removes fades. Token timing never changes."
            options={[
              { value: "system", label: "System", hint: "Follow the device" },
              { value: "reduce", label: "Reduce", hint: "No transitions" },
              { value: "allow", label: "Allow", hint: "Subtle fades" },
            ]}
          />
          <Switch
            label="Sound"
            description="A quiet tick per token and a tone for a correct answer. Off by default."
            checked={s.sound}
            onChange={(on) => save({ sound: on })}
          />
        </div>
      </section>

      <section aria-labelledby="account-heading" className="mt-10 border-t border-ink pt-5">
        <SectionLabel id="account-heading">
          Leaderboard
        </SectionLabel>
        <div className="mt-4">
          <NameField initial={s.displayName} />
        </div>
      </section>
    </div>
  );
}
