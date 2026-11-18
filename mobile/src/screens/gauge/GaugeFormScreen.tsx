import { Stack, useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRepository, NAME_MAX_LENGTH } from '@/data';
import {
  countedPausedMs,
  DAY_MS,
  type Gauge,
  gaugeLevel,
  isRed,
  lastExecution,
  ORANGE_ABOVE,
  pausedSince,
  suggestEmoji,
} from '@/domain';
import { dateLocale, errorMessage, formatLastDone, formatShortDate, relativeFormatter, t } from '@/i18n';
import { useGauge, useGauges, useLabels, useNow, useReminders, useSession, useToast } from '@/state';
import { Button, DateTimeField, Gauge as GaugeBar, Icon, SwitchRow, TextField } from '@/ui/components';
import { confirm, useAndroidKeyboardHeight } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { useGaugeActions } from '../home/useGaugeActions';
import { Section } from '../Section';
import { StatusView } from '../StatusView';
import { CurvePicker } from './CurvePicker';
import type { AutosaveState } from './autosave';
import {
  choicesFromGauge,
  daysUntilLevel,
  type GaugeFormValues,
  hasLabelChanges,
  type LabelChoice,
  labelChanges,
  validateGaugeForm,
  valuesFromGauge,
} from './form';
import { HistorySection } from './HistorySection';
import { IntervalPicker } from './IntervalPicker';
import { LabelPicker } from './LabelPicker';
import { useGaugeAutosave } from './useGaugeAutosave';

const MAX_WIDTH = 640;

interface StoredView {
  name: string;
  repeatDays: number;
  curve: string;
  labels: string;
  items: unknown;
}

function sameStored(a: StoredView, b: StoredView): boolean {
  return (
    a.name === b.name &&
    a.repeatDays === b.repeatDays &&
    a.curve === b.curve &&
    a.labels === b.labels &&
    a.items === b.items
  );
}

const NEW_VALUES: GaugeFormValues = { name: '', repeatDays: 7, curve: 'linear' };

/**
 * The create screen. `labelId` presets one label, for example from a label
 * page. `name` presets the name, for example from a search with no result.
 */
export function NewGaugeScreen({ labelId, name }: { labelId?: string; name?: string }) {
  return <GaugeForm gauge={null} presetLabelId={labelId} presetName={name} />;
}

/**
 * The page of one gauge: its state, its settings, the history, and delete.
 * A paused gauge also has "Archive".
 */
export function EditGaugeScreen({ id }: { id: string }) {
  const gauge = useGauge(id);
  const { status } = useGauges();
  if (!gauge) {
    return (
      <>
        <Stack.Screen options={{ title: t.gauge.editTitle }} />
        {status === 'loading' ? <StatusView kind="loading" /> : <StatusView kind="message" title={t.gauge.notFound} />}
      </>
    );
  }
  return <GaugeForm gauge={gauge} />;
}

/**
 * Asks before the user leaves the create form with changes. `leave` lets a
 * save or an archive go back without the question. The gauge page saves
 * each change by itself, so it never asks.
 */
function useDiscardPrompt(dirty: boolean): { leave: () => void } {
  const navigation = useNavigation();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  usePreventRemove(dirty && !leaving, ({ data }) => {
    void confirm({
      title: t.gauge.unsavedTitle,
      message: t.gauge.unsavedBody,
      confirmLabel: t.gauge.discard,
      cancelLabel: t.gauge.keepEditing,
      destructive: true,
    }).then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });

  useEffect(() => {
    if (leaving) router.back();
  }, [leaving, router]);

  return { leave: () => setLeaving(true) };
}

/**
 * The form that create and edit share. `gauge` is `null` on create.
 *
 * The create form saves with its button. The gauge page saves each change
 * by itself (see `autosave.ts`): a choice at once, a text after a short
 * quiet time, on blur, and when the user leaves the page. An invalid value
 * does not save: the data keeps the last valid value.
 */
function GaugeForm({
  gauge,
  presetLabelId,
  presetName,
}: {
  gauge: Gauge | null;
  presetLabelId?: string;
  presetName?: string;
}) {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { user } = useSession();
  const showToast = useToast();
  const labels = useLabels();
  const keyboardHeight = useAndroidKeyboardHeight();

  const [presetChoices] = useState<LabelChoice[]>(() =>
    presetLabelId ? choicesFromGauge({ labelIds: [presetLabelId] }, labels.items) : [],
  );
  const [labelChoices, setLabelChoices] = useState<LabelChoice[]>(() =>
    gauge ? choicesFromGauge(gauge, labels.items) : presetChoices,
  );
  const [values, setValues] = useState<GaugeFormValues>(() =>
    gauge ? valuesFromGauge(gauge) : { ...NEW_VALUES, name: presetName?.trim() ?? '' },
  );
  const [lastDoneAt, setLastDoneAt] = useState(() => Date.now());
  // The gauge page shows the errors at once: there is no Save to press.
  const [tried, setTried] = useState(gauge !== null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { saver, state: autosave } = useGaugeAutosave(gauge);

  const errors = validateGaugeForm(values, { nameMax: NAME_MAX_LENGTH });
  const valid = Object.keys(errors).length === 0;
  const dirty =
    !gauge && (values.name.trim() !== (presetName?.trim() ?? '') || hasLabelChanges(presetChoices, labelChoices));
  const { leave } = useDiscardPrompt(dirty);
  const gaugeActions = useGaugeActions();

  // A change in the data, for example by another member, shows in each
  // field that the user did not change. The field that the user types in
  // keeps its text. The labels of the gauge page follow the data. The form
  // adjusts its state during the render, when the data differs from the
  // data of the last render.
  const stored = gauge
    ? { name: gauge.name, repeatDays: gauge.repeatDays, curve: gauge.curve, labels: gauge.labelIds.join(','), items: labels.items }
    : null;
  const [seen, setSeen] = useState(stored);
  if (gauge && saver && stored && seen && !sameStored(seen, stored)) {
    setSeen(stored);
    setValues((previous) => ({
      // A saved name has no spaces at the ends. Keep the text of the user
      // while it gives the same name.
      name: saver.isTouched('name') || previous.name.trim() === stored.name ? previous.name : stored.name,
      repeatDays: saver.isTouched('repeatDays') ? previous.repeatDays : stored.repeatDays,
      curve: saver.isTouched('curve') ? previous.curve : stored.curve,
    }));
    if (seen.labels !== stored.labels || seen.items !== stored.items) {
      setLabelChoices(choicesFromGauge(gauge, labels.items));
    }
  }

  /** A change of the user. On the gauge page, `when` tells the autosave to save now or after the quiet time. */
  const update = (patch: Partial<GaugeFormValues>, when: 'now' | 'later') => {
    setValues((previous) => ({ ...previous, ...patch }));
    setSaveError(null);
    saver?.change(patch, when);
  };

  const changeLabels = (next: LabelChoice[]) => {
    const before = labelChoices;
    setLabelChoices(next);
    if (!gauge || !saver) return;
    // The gauge page saves a label change at once.
    const repository = getRepository();
    const { add, remove, create } = labelChanges(before, next);
    const created = create.map(({ name, emoji }) => repository.createLabel(name, emoji ?? suggestEmoji(name)));
    created.forEach((label) => saver.track(label.saved));
    [...add, ...created.map((label) => label.id)].forEach((labelId) =>
      saver.track(repository.addLabelToGauge(gauge.id, labelId)),
    );
    remove.forEach((labelId) => saver.track(repository.removeLabelFromGauge(gauge.id, labelId)));
  };

  const nameError =
    tried && errors.name === 'required'
      ? t.gauge.nameRequired
      : errors.name === 'tooLong'
        ? t.gauge.nameTooLong(NAME_MAX_LENGTH)
        : null;

  const redAfter = Math.max(1, Math.round(daysUntilLevel(values.curve, values.repeatDays ?? 1, ORANGE_ABOVE)));

  /** Creates the gauge. Only the create form has this button. */
  const create = () => {
    setTried(true);
    if (gauge || !valid || values.repeatDays === null) return;
    const repository = getRepository();
    const fail = (error: unknown) => showToast({ message: errorMessage(error, t), tone: 'error' });
    setSaveError(null);
    // No write here waits for the server, so the form closes at once, also
    // offline. The local cache shows each change. A later error comes back
    // as a toast.
    try {
      const { add, create: newLabels } = labelChanges([], labelChoices);
      const created = newLabels.map(({ name, emoji }) => repository.createLabel(name, emoji ?? suggestEmoji(name)));
      created.forEach((label) => label.saved.catch(fail));
      repository
        .createGauge({
          name: values.name,
          repeatDays: values.repeatDays,
          curve: values.curve,
          labelIds: [...add, ...created.map((label) => label.id)],
          doneAt: Math.min(lastDoneAt, Date.now()),
        })
        .saved.catch(fail);
      leave();
    } catch (error) {
      setSaveError(errorMessage(error, t));
    }
  };

  const archive = () => {
    if (!gauge) return;
    gaugeActions.archive(gauge);
    leave();
  };

  const remove = async () => {
    if (!gauge) return;
    if (await gaugeActions.remove(gauge)) {
      // The gauge is gone: drop a change that waits for the quiet time.
      saver?.cancel();
      leave();
    }
  };

  const fields = (
    <>
      <TextField
        label={t.gauge.name}
        value={values.name}
        onChangeText={(name) => update({ name }, 'later')}
        onBlur={() => saver?.flush()}
        placeholder={t.gauge.namePlaceholder}
        // The create form starts with the name, the only field that the user
        // must fill. The edit page does not focus a field.
        autoFocus={!gauge}
        autoCapitalize="sentences"
        returnKeyType="done"
        maxLength={NAME_MAX_LENGTH + 10}
        error={nameError}
        testID="gauge-name"
      />

      <Section title={t.gauge.labels}>
        <LabelPicker value={labelChoices} onChange={changeLabels} labels={labels.items} />
      </Section>

      <Section title={t.gauge.interval}>
        <IntervalPicker
          value={values.repeatDays}
          // A quick choice saves at once. The free number saves after the quiet time.
          onChange={(repeatDays, source) => update({ repeatDays }, source === 'choice' ? 'now' : 'later')}
          onBlur={() => saver?.flush()}
          showError={tried}
        />
      </Section>

      <Section title={t.gauge.curve}>
        <CurvePicker
          value={values.curve}
          onChange={(curve) => update({ curve }, 'now')}
          footer={t.gauge.redAfter(redAfter)}
        />
      </Section>

      {!gauge ? (
        <Section title={t.gauge.lastDone}>
          <View style={[styles.wrapLine, { gap: spacing.sm }]}>
            <DateTimeField
              value={lastDoneAt}
              onChange={setLastDoneAt}
              max={now}
              accessibilityLabel={t.gauge.lastDone}
              testID="last-done"
            />
            <Button label={t.gauge.lastDoneNow} variant="plain" onPress={() => setLastDoneAt(Date.now())} />
          </View>
        </Section>
      ) : null}

      {saveError ? (
        <Text style={[typography.callout, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {saveError}
        </Text>
      ) : null}
      {/* The gauge page saves each change by itself, so it has no Save. */}
      {!gauge ? (
        <Button label={t.common.save} onPress={create} disabled={tried && !valid} testID="gauge-save" />
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: gauge ? gauge.name : t.gauge.newTitle }} />
      {/*
        The keyboard must not hide the fields or Save. iOS moves the content
        above the keyboard by itself, also in the modal sheet. Android gets
        the keyboard height as extra bottom padding.
      */}
      <ScrollView
        style={[styles.flex, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.xxxl * 2 + keyboardHeight,
            paddingLeft: insets.left + spacing.page,
            paddingRight: insets.right + spacing.page,
          },
        ]}
      >
        <View style={[styles.column, { gap: spacing.xl }]}>
          {gauge && user ? (
            <>
              <AutosaveLine state={autosave} />
              <GaugeSummary gauge={gauge} now={now} />
              {fields}
              <MuteSwitch gauge={gauge} uid={user.uid} />
              <PauseControl gauge={gauge} />
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
              <HistorySection gauge={gauge} myUid={user.uid} now={now} />
              <View style={[styles.start, { gap: spacing.xs }]}>
                {/* An active gauge has "Pause" in place of "Archive". Archive is for a paused gauge. */}
                {pausedSince(gauge) !== null ? (
                  <Button label={t.gauge.archive} icon="archive" variant="plain" onPress={archive} testID="gauge-archive" />
                ) : null}
                <Button label={t.gauge.deleteGauge} icon="trash" variant="danger" onPress={remove} testID="gauge-delete" />
              </View>
            </>
          ) : (
            fields
          )}
        </View>
      </ScrollView>
    </>
  );
}

/**
 * The state of the gauge at the top of its page: the bar (the same bar as in
 * the rows of the home list), the last time, the interval, and when it turns
 * red. The page has no "Done" button: the row of the list has the action,
 * also for a screen reader and for a mouse on the website. "I did it on…"
 * in the history adds a past time. A paused gauge has a grey bar at its
 * frozen level, and "Paused since …" in place of the time when it turns red.
 */
function GaugeSummary({ gauge, now }: { gauge: Gauge; now: number }) {
  const { colors, spacing, typography } = useTheme();
  const level = gaugeLevel(gauge, now);
  const since = pausedSince(gauge);
  const lastAt = lastExecution(gauge.executions)?.at ?? null;
  // The paused time of earlier pauses moves the red day later.
  const redAt =
    lastAt === null
      ? null
      : lastAt + countedPausedMs(gauge) + daysUntilLevel(gauge.curve, gauge.repeatDays, ORANGE_ABOVE) * DAY_MS;
  const redInDays = redAt === null ? null : Math.max(0, Math.ceil((redAt - now) / DAY_MS));

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        <GaugeBar level={level} paused={since !== null} accessibilityLabel={t.gauge.levelLabel} />
        <View style={[styles.line, { gap: spacing.sm }]}>
          <Text style={[typography.callout, styles.flex, { color: colors.textMuted }]} testID="gauge-last">
            {formatLastDone(lastAt, now, t, relativeFormatter)}
          </Text>
          <Icon name="repeat" color={colors.textMuted} size={15} />
          <Text style={[typography.callout, { color: colors.textMuted }]}>{t.time.every(gauge.repeatDays)}</Text>
        </View>
        {since !== null ? (
          <Text style={[typography.caption, { color: colors.textMuted }]} testID="gauge-paused">
            {t.home.pausedSince(formatShortDate(since, dateLocale, now))}
          </Text>
        ) : redInDays !== null && !isRed(level) ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t.gauge.redIn(redInDays)}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** "Remind me about this gauge": the mute of the user for this gauge. The change shows at once from the local cache. */
function MuteSwitch({ gauge, uid }: { gauge: Gauge; uid: string }) {
  const showToast = useToast();
  const { supported } = useReminders();
  const reminded = !gauge.mutedBy.includes(uid);
  return (
    <SwitchRow
      label={t.reminders.mute}
      help={supported ? t.reminders.muteHelp : t.reminders.muteHelpWeb}
      value={reminded}
      onValueChange={(value) =>
        getRepository()
          .setMuted(gauge.id, !value)
          .catch((error) => showToast({ message: errorMessage(error, t), tone: 'error' }))
      }
      testID="gauge-remind"
    />
  );
}

/**
 * The status of the autosave, at the top of the gauge page: "Saving…",
 * "Saved", or why a change is not saved. Screen readers hear "Saved" and
 * the error, but not "Saving…", so that they do not hear each pause in the
 * typing two times.
 */
function AutosaveLine({ state }: { state: AutosaveState }) {
  const { colors, typography } = useTheme();
  const text =
    state.status === 'saving'
      ? t.gauge.saving
      : state.status === 'saved'
        ? t.gauge.saved
        : state.status === 'error'
          ? t.gauge.notSaved(errorMessage(state.error, t))
          : '';
  const spoken = state.status === 'saved' || state.status === 'error';
  return (
    // The line keeps its height, so that the page does not jump.
    <View accessibilityLiveRegion="polite" aria-live="polite" style={styles.statusLine} testID="gauge-autosave">
      <Text
        style={[typography.caption, styles.statusText, { color: state.status === 'error' ? colors.danger : colors.textMuted }]}
        aria-hidden={!spoken}
        importantForAccessibility={spoken ? 'auto' : 'no-hide-descendants'}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * "Pause" for an active gauge, "Resume" for a paused one, with one line of
 * help. The change is for all members. It needs a connection.
 */
function PauseControl({ gauge }: { gauge: Gauge }) {
  const { colors, spacing, typography } = useTheme();
  const actions = useGaugeActions();
  const paused = pausedSince(gauge) !== null;
  return (
    <View style={[styles.start, { gap: spacing.xs }]}>
      <Button
        label={paused ? t.gauge.resume : t.gauge.pause}
        icon={paused ? 'play' : 'pause'}
        variant={paused ? 'primary' : 'secondary'}
        onPress={() => (paused ? actions.resume(gauge) : actions.pause(gauge))}
        testID={paused ? 'gauge-resume' : 'gauge-pause'}
      />
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        {paused ? t.gauge.pausedHelp : t.gauge.pauseHelp}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrapLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
  start: {
    alignItems: 'flex-start',
  },
  statusLine: {
    minHeight: 18,
    // The gap of the column is too big above the summary.
    marginBottom: -12,
  },
  statusText: {
    textAlign: 'right',
  },
});
