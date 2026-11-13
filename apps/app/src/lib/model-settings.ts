// Canonical source: api/contracts/model-settings.ts.
// Generated into Web and Desktop by api/scripts/sync_model_settings.py. Do not edit copies.
export interface SettingOption { value: string; label?: string; description?: string }
export interface ConditionalSetting {
  options?: SettingOption[];
  defaultValue?: unknown;
  channelOptions?: Record<string, SettingOption[]>;
  resolutionOptions?: Record<string, SettingOption[]>;
  showChannels?: string[];
  showResolutions?: string[];
  apiOnly?: boolean;
}
export type SettingSelection = Record<string, unknown>;
export const outputFieldNames = ['channel','quality','aspect_ratio','resolution','num_images','num_outputs','quantity','generate_audio','with_audio','language','format','output_format'];

/** Shared by Playground and preferences; no IO, state, or framework dependencies. */
export function resolveSetting<T extends ConditionalSetting>(field: T, selection: SettingSelection): T | undefined {
  const channel = String(selection.channel ?? '');
  const resolution = String(selection.resolution ?? '');
  if (field.apiOnly || (channel && field.showChannels && !field.showChannels.includes(channel)) ||
      (resolution && field.showResolutions && !field.showResolutions.some(value => value.toLowerCase() === resolution.toLowerCase()))) return undefined;
  const channelOptions = channel ? field.channelOptions?.[channel] : undefined;
  const resolutionKey = resolution && Object.keys(field.resolutionOptions ?? {}).find(value => value.toLowerCase() === resolution.toLowerCase());
  const resolutionOptions = resolutionKey ? field.resolutionOptions?.[resolutionKey] : undefined;
  if (!channelOptions && !resolutionOptions) return field;
  let options = resolutionOptions ?? channelOptions;
  if (resolutionOptions && channelOptions) {
    const supported = new Set(channelOptions.map(option => option.value));
    options = resolutionOptions.filter(option => supported.has(option.value));
  }
  return {...field, options, defaultValue: options?.[0]?.value};
}
export function uniqueOutputValues(values: Iterable<string>, preserveOrder = false): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!unique.has(key) || value === value.toUpperCase()) unique.set(key, value);
  }
  return preserveOrder ? [...unique.values()] : [...unique.values()].sort();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
function options(value: unknown): SettingOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap(item => {
    const option = record(item);
    return typeof option.value === 'string' ? [{value: option.value, ...(typeof option.label === 'string' ? {label: option.label} : {})}] : [];
  });
}
function overrides(value: unknown): Record<string, SettingOption[]> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, list]) => [key, options(list) ?? []]));
}
function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}
export interface OutputSetting { name: string; values: string[]; labels?: Record<string, string>; defaultValue?: string }
const allowed = new Set(outputFieldNames);
const compiled = new WeakMap<object, {name: string; field: ConditionalSetting}[]>();
/** Compile once per immutable catalog schema; channel changes only resolve compiled fields. */
function compile(schema: object) {
  const cached = compiled.get(schema);
  if (cached) return cached;
  const fields = Object.entries(record(record(schema).properties)).flatMap(([name, raw]) => {
    const property = record(raw);
    if (!allowed.has(name) || !Array.isArray(property.enum)) return [];
    const labels = record(property['x-option-labels']);
    const values = property.enum.filter(value => ['string','number','boolean'].includes(typeof value) && String(value).length <= 500);
    return [{name, field: {
      options: values.map(value => ({value: String(value), ...(typeof labels[String(value)] === 'string' ? {label: String(labels[String(value)])} : {})})),
      defaultValue: property.default,
      channelOptions: overrides(property['x-channel-options']), resolutionOptions: overrides(property['x-resolution-options']),
      showChannels: strings(property['x-show-channels']), showResolutions: strings(property['x-show-resolutions']), apiOnly: Boolean(property['x-api-only']),
    }}];
  });
  compiled.set(schema, fields);
  return fields;
}
/** Intersect variants so every displayed preference is supported by every execution path. */
export function outputSettingsForSchemas(schemas: object[], selection: SettingSelection = {}): OutputSetting[] {
  let common: Map<string, OutputSetting> | undefined;
  for (const schema of schemas) {
    const fields = compile(schema);
    const channel = fields.find(field => field.name === 'channel')?.field;
    const effective = {...selection};
    if (!effective.channel || effective.channel === 'auto') effective.channel = channel?.defaultValue ?? channel?.options?.[0]?.value;
    if (!effective.resolution || effective.resolution === 'auto') {
      const resolution = fields.find(field => field.name === 'resolution')?.field;
      effective.resolution = resolution && resolveSetting(resolution, effective)?.defaultValue;
    }
    const current = new Map<string, OutputSetting>();
    for (const {name, field} of fields) {
      const resolved = resolveSetting(field, effective);
      if (!resolved?.options?.length) continue;
      const values = uniqueOutputValues(resolved.options.map(option => option.value), true);
      const labels = Object.fromEntries(resolved.options.flatMap(option => option.label ? [[option.value, option.label]] : []));
      current.set(name, {name, values, ...(Object.keys(labels).length ? {labels} : {}), ...(name === 'channel' ? {defaultValue: String(channel?.defaultValue ?? values[0])} : {})});
    }
    if (!common) common = current;
    else for (const [name, field] of common) {
      const supported = new Set(current.get(name)?.values.map(value => value.toLowerCase()) ?? []);
      const values = field.values.filter(value => supported.has(value.toLowerCase()));
      if (values.length) common.set(name, {...field, values}); else common.delete(name);
    }
  }
  return [...(common?.values() ?? [])];
}
