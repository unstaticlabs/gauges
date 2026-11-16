import { Stack, useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRepository, NAME_MAX_LENGTH } from '@/data';
import {
  DAY_MS,
  type Gauge,
  gaugeLevel,
  isRed,
  lastExecution,
  ORANGE_ABOVE,
  suggestEmoji,
} from '@/domain';
import { errorMessage, formatLastDone, relativeFormatter, t } from '@/i18n';
import { useGauge, useGauges, useLabels, useNow, useReminders, useSession, useToast } from '@/state';
import { Button, DateTimeField, Gauge as GaugeBar, Icon, SwitchRow, TextField } from '@/ui/components';
import { confirm, useAndroidKeyboardHeight } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { useGaugeActions } from '../home/useGaugeActions';
import { Section } from '../Section';
import { StatusView } from '../StatusView';
import { CurvePicker } from './CurvePicker';
import {
  changesFrom,
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

const MAX_WIDTH = 640;

const NEW_VALUES: GaugeFormValues = { name: '', repeatDays: 7, curve: 'linear' };

/**
 * The create screen. `labelId` presets one label, for example from a label
 * page. `name` presets the name, for example from a search with no result.
 */
export function NewGaugeScreen({ labelId, name }: { labelId?: string; name?: string }) {
  return <GaugeForm gauge={null} presetLabelId={labelId} presetName={name} />;
}

/** The page of one gauge: its state, its settings, the history, and archive and delete. */
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
 * Asks before the user leaves a form with changes. `leave` lets a save or an
 * archive go back without the question.
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

/** The form that create and edit share. `gauge` is `null` on create. */
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

  // The labels of the gauge when the form opened. The save compares with them.
  const [initialChoices] = useState<LabelChoice[]>(() => choicesFromGauge(gauge, labels.items));
  const [presetChoices] = useState<LabelChoice[]>(() =>
    presetLabelId ? choicesFromGauge({ labelIds: [presetLabelId] }, labels.items) : [],
  );
  const [labelChoices, setLabelChoices] = useState<LabelChoice[]>(() => (gauge ? initialChoices : presetChoices));
  const [values, setValues] = useState<GaugeFormValues>(() =>
    gauge ? valuesFromGauge(gauge) : { ...NEW_VALUES, name: presetName?.trim() ?? '' },
  );
  const [lastDoneAt, setLastDoneAt] = useState(() => Date.now());
  const [tried, setTried] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = validateGaugeForm(values, { nameMax: NAME_MAX_LENGTH });
  const valid = Object.keys(errors).length === 0;
  const changes = gauge ? changesFrom(gauge, values) : null;
  const dirty = gauge
    ? Object.keys(changes ?? {}).length > 0 || hasLabelChanges(initialChoices, labelChoices)
    : values.name.trim() !== (presetName?.trim() ?? '') || hasLabelChanges(presetChoices, labelChoices);
  const { leave } = useDiscardPrompt(dirty);
  const gaugeActions = useGaugeActions();

  const update = (patch: Partial<GaugeFormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    setSaveError(null);
  };

  const nameError =
    tried && errors.name === 'required'
      ? t.gauge.nameRequired
      : errors.name === 'tooLong'
        ? t.gauge.nameTooLong(NAME_MAX_LENGTH)
        : null;

  const redAfter = Math.max(1, Math.round(daysUntilLevel(values.curve, values.repeatDays ?? 1, ORANGE_ABOVE)));

  const save = () => {
    setTried(true);
    if (!valid || values.repeatDays === null) return;
    const repository = getRepository();
    const fail = (error: unknown) => showToast({ message: errorMessage(error, t), tone: 'error' });
    setSaveError(null);
    // No write here waits for the server, so the form closes at once, also
    // offline. The local cache shows each change. A later error comes back
    // as a toast.
    try {
      const { add, remove, create } = labelChanges(initialChoices, labelChoices);
      const created = create.map(({ name, emoji }) => repository.createLabel(name, emoji ?? suggestEmoji(name)));
      created.forEach((label) => label.saved.catch(fail));
      const addIds = [...add, ...created.map((label) => label.id)];

      if (gauge) {
        if (changes && Object.keys(changes).length > 0) repository.updateGauge(gauge.id, changes).catch(fail);
        addIds.forEach((labelId) => repository.addLabelToGauge(gauge.id, labelId).catch(fail));
        remove.forEach((labelId) => repository.removeLabelFromGauge(gauge.id, labelId).catch(fail));
        showToast({ message: t.gauge.saved, durationMs: 2500 });
      } else {
        repository
          .createGauge({
            name: values.name,
            repeatDays: values.repeatDays,
            curve: values.curve,
            labelIds: addIds,
            doneAt: Math.min(lastDoneAt, Date.now()),
          })
          .saved.catch(fail);
      }
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
    if (await gaugeActions.remove(gauge)) leave();
  };

  const fields = (
    <>
      <TextField
        label={t.gauge.name}
        value={values.name}
        onChangeText={(name) => update({ name })}
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
        <LabelPicker value={labelChoices} onChange={setLabelChoices} labels={labels.items} />
      </Section>

      <Section title={t.gauge.interval}>
        <IntervalPicker value={values.repeatDays} onChange={(repeatDays) => update({ repeatDays })} showError={tried} />
      </Section>

      <Section title={t.gauge.curve}>
        <CurvePicker value={values.curve} onChange={(curve) => update({ curve })} footer={t.gauge.redAfter(redAfter)} />
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
      {/* On the gauge page, Save shows only when there is a change to save. */}
      {!gauge || dirty ? (
        <Button label={t.common.save} onPress={save} disabled={tried && !valid} testID="gauge-save" />
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
              <GaugeSummary gauge={gauge} now={now} />
              {fields}
              <MuteSwitch gauge={gauge} uid={user.uid} />
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
              <HistorySection gauge={gauge} myUid={user.uid} now={now} />
              <View style={[styles.start, { gap: spacing.xs }]}>
                <Button label={t.gauge.archive} icon="archive" variant="plain" onPress={archive} testID="gauge-archive" />
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
 * in the history adds a past time.
 */
function GaugeSummary({ gauge, now }: { gauge: Gauge; now: number }) {
  const { colors, spacing, typography } = useTheme();
  const level = gaugeLevel(gauge, now);
  const lastAt = lastExecution(gauge.executions)?.at ?? null;
  const redAt = lastAt === null ? null : lastAt + daysUntilLevel(gauge.curve, gauge.repeatDays, ORANGE_ABOVE) * DAY_MS;
  const redInDays = redAt === null ? null : Math.max(0, Math.ceil((redAt - now) / DAY_MS));

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        <GaugeBar level={level} accessibilityLabel={t.gauge.levelLabel} />
        <View style={[styles.line, { gap: spacing.sm }]}>
          <Text style={[typography.callout, styles.flex, { color: colors.textMuted }]} testID="gauge-last">
            {formatLastDone(lastAt, now, t, relativeFormatter)}
          </Text>
          <Icon name="repeat" color={colors.textMuted} size={15} />
          <Text style={[typography.callout, { color: colors.textMuted }]}>{t.time.every(gauge.repeatDays)}</Text>
        </View>
        {redInDays !== null && !isRed(level) ? (
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
});
