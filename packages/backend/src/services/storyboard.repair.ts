import type {
  ComponentName,
  SceneChild,
  SceneInstruction,
  StoryboardPlan,
} from '@edumotion/shared';

/**
 * Deterministic prop repair for model-authored storyboards.
 *
 * A 7B model routinely chooses a component that exists but invents plausible
 * prop names (`leftTitle` instead of `left`, `equation` instead of `items`).
 * Those shapes pass storyboard validation and then throw inside the renderer,
 * where SceneBoundary turns the whole scene black. Repairing here keeps the
 * model's intent while guaranteeing the renderer receives a supported shape.
 */

type Props = Record<string, unknown>;

function isRecord(value: unknown): value is Props {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitSides(raw: Props): { left: Props; right: Props } | null {
  const leftRecord = isRecord(raw['left'])
    ? raw['left']
    : typeof raw['left'] === 'string'
      ? { content: raw['left'] }
      : {};
  const rightRecord = isRecord(raw['right'])
    ? raw['right']
    : typeof raw['right'] === 'string'
      ? { content: raw['right'] }
      : {};

  const leftContent = str(
    leftRecord['content'] ?? leftRecord['text'] ?? raw['leftTitle'] ?? raw['leftText'],
  );
  const rightContent = str(
    rightRecord['content'] ?? rightRecord['text'] ?? raw['rightTitle'] ?? raw['rightText'],
  );
  if (!leftContent && !rightContent) return null;

  return {
    left: {
      ...leftRecord,
      content: leftContent || rightContent || 'Left',
      ...(str(leftRecord['label']) ? { label: str(leftRecord['label']) } : {}),
    },
    right: {
      ...rightRecord,
      content: rightContent || leftContent || 'Right',
      ...(str(rightRecord['label']) ? { label: str(rightRecord['label']) } : {}),
    },
  };
}

function repairProps(component: ComponentName, raw: Props): Props | null {
  switch (component) {
    case 'SplitScreenComparison': {
      const sides = splitSides(raw);
      if (!sides) return null;
      return {
        ...raw,
        ...sides,
        comparisonLabel: str(raw['comparisonLabel'], 'vs') || 'vs',
      };
    }

    case 'ProcessFlow': {
      const steps = Array.isArray(raw['steps'])
        ? raw['steps']
            .map((step): Props | null => {
              if (typeof step === 'string') return { label: step.trim() };
              if (!isRecord(step)) return null;
              const label = str(step['label'] ?? step['text'] ?? step['title']);
              return label ? { ...step, label } : null;
            })
            .filter((step): step is Props => step !== null)
        : [];
      if (steps.length === 0) return null;

      const direction = raw['direction'] === 'vertical' || raw['direction'] === 'horizontal'
        ? raw['direction']
        : steps.length > 2
          ? 'vertical'
          : 'horizontal';

      return {
        ...raw,
        steps,
        direction,
        stepSpacing: num(raw['stepSpacing'], direction === 'vertical' ? 64 : 96),
      };
    }

    case 'AnimatedDiagram': {
      const items = Array.isArray(raw['items'])
        ? raw['items']
            .filter(isRecord)
            .map((item): Props | null => {
              const label = str(item['label'] ?? item['text']);
              if (!label) return null;
              const position = isRecord(item['position']) ? item['position'] : {};
              return {
                ...item,
                icon: str(item['icon'], 'book') || 'book',
                label,
                position: {
                  x: num(position['x'], 0),
                  y: num(position['y'], 0),
                },
              };
            })
            .filter((item): item is Props => item !== null)
        : [];
      const equation = str(raw['equation'] ?? raw['formula']);
      if (items.length === 0 && !equation) return null;

      return {
        ...raw,
        items,
        ...(equation ? { equation } : {}),
      };
    }

    case 'EndScreen': {
      const title = str(raw['title'] ?? raw['text'] ?? raw['heading']);
      return {
        ...raw,
        ...(title ? { title } : {}),
      };
    }

    case 'Timeline': {
      const events = Array.isArray(raw['events'])
        ? raw['events']
            .map((event): Props | null => {
              if (typeof event === 'string') return { date: '', title: event.trim() };
              if (!isRecord(event)) return null;
              const title = str(event['title'] ?? event['label'] ?? event['text']);
              return title ? { ...event, date: str(event['date']), title } : null;
            })
            .filter((event): event is Props => event !== null)
        : [];
      if (events.length === 0) return null;
      return { ...raw, events };
    }

    case 'KineticTypography': {
      const text = str(raw['text']);
      const words = Array.isArray(raw['words'])
        ? raw['words'].filter((word) => typeof word === 'string' || isRecord(word))
        : [];
      if (!text && words.length === 0) return null;
      return { ...raw, text, words };
    }

    case 'NumberCounter': {
      const target = Number(raw['target']);
      if (!Number.isFinite(target)) return null;
      return { ...raw, target };
    }

    case 'Callout': {
      const text = str(raw['text']);
      if (!text) return null;
      const target = isRecord(raw['target']) ? raw['target'] : {};
      return {
        ...raw,
        text,
        target: {
          x: num(target['x'], 50),
          y: num(target['y'], 50),
        },
      };
    }

    // These components require React children, which cannot arrive through a
    // JSON storyboard. Dropping them lets the scene's other visual (or the
    // deterministic diagram) render instead of crashing on undefined children.
    case 'HighlightedRegion':
    case 'ObjectZoom':
      return null;

    default:
      return raw;
  }
}

function captionText(scene: SceneInstruction): string {
  const subtitle = scene.children?.find((child) => child.component === 'Subtitle');
  const entries = subtitle?.props['entries'];
  if (!Array.isArray(entries)) return '';
  return entries
    .map((entry) =>
      isRecord(entry) && typeof entry['text'] === 'string' ? entry['text'] : '',
    )
    .filter(Boolean)
    .join(' ')
    .trim();
}

export interface StoryboardRepairReport {
  storyboard: StoryboardPlan;
  repaired: number;
  dropped: string[];
}

export function repairStoryboardProps(plan: StoryboardPlan): StoryboardRepairReport {
  let repaired = 0;
  const dropped: string[] = [];

  const scenes = plan.scenes.map((scene) => {
    const narration = captionText(scene).toLowerCase();

    // Key terms are used for asset verification and content warnings. A term the
    // scene never speaks is not a fact about this scene, so do not keep it there.
    const keyTerms = scene.keyTerms?.filter((term) => {
      if (!narration) return true;
      return term.trim().length > 0 && narration.includes(term.toLowerCase());
    });
    if (keyTerms && keyTerms.length !== scene.keyTerms?.length) repaired++;

    const children: SceneChild[] = [];
    for (const child of scene.children ?? []) {
      const props = repairProps(child.component, child.props);
      if (!props) {
        dropped.push(`${scene.id}:${child.component}`);
        repaired++;
        continue;
      }
      if (props !== child.props) repaired++;
      children.push({ ...child, props });
    }

    const rootProps = repairProps(scene.component, scene.props);
    if (rootProps === null) {
      dropped.push(`${scene.id}:${scene.component} root`);
      repaired++;
    }

    return {
      ...scene,
      ...(keyTerms && keyTerms.length > 0 ? { keyTerms } : { keyTerms: undefined }),
      ...(rootProps ? { props: rootProps } : {}),
      children,
    };
  });

  if (repaired > 0) {
    console.warn(
      `[Storyboard] Repaired ${repaired} unsupported component prop(s)` +
        (dropped.length > 0 ? `; dropped ${dropped.slice(0, 4).join(', ')}` : ''),
    );
  }

  return {
    storyboard: repaired > 0 ? { ...plan, scenes } : plan,
    repaired,
    dropped,
  };
}
