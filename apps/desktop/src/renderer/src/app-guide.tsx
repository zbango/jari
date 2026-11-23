import { Mascot, mascotDesignProps } from "@once-ui-system/core";
import type { MascotMood, MascotState } from "@once-ui-system/core";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { FocusTrap } from "@once-ui-system/core/components/FocusTrap";
import { Heading } from "@once-ui-system/core/components/Heading";
import { IconButton } from "@once-ui-system/core/components/IconButton";
import { ProgressBar } from "@once-ui-system/core/components/ProgressBar";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MascotDesignContext } from "./workflow/provider-activity";

type GuideStep = {
  target: string;
  title: string;
  description: string;
  mood: MascotMood;
  state: MascotState;
};

const introduction: GuideStep[] = [
  {
    target: "new-workflow",
    title: "Start with a work item",
    description: "Choose a local workspace and pick a Jira issue or start with a simulated issue.",
    mood: "happy",
    state: "idle",
  },
  {
    target: "knowledge",
    title: "Bring in Company Knowledge",
    description: "Save team notes here, then attach the relevant ones when you create a workflow.",
    mood: "neutral",
    state: "listening",
  },
];

const canvasSteps: GuideStep[] = [
  {
    target: "workflow-stages",
    title: "Follow the milestones",
    description:
      "Use the stage tabs to focus the canvas. Review and approve the plan before starting Build, then review each task as it finishes.",
    mood: "focused",
    state: "thinking",
  },
  {
    target: "workflow-details",
    title: "Inspect a node",
    description:
      "Select a node and open Details to see its settings, tasks, or provider activity. Expand a milestone to find its detail nodes.",
    mood: "neutral",
    state: "listening",
  },
  {
    target: "canvas-style",
    title: "Arrange your canvas",
    description:
      "Switch between Map, Timeline, and Compact. Use Edit layout to drag or resize nodes, or Add milestone to track work after Build.",
    mood: "excited",
    state: "speaking",
  },
];

const onboardingStep: GuideStep = {
  target: "workflow-path",
  title: "Go from Idea to Build",
  description:
    "Your first workflow opens an interactive canvas. Review the plan before approving Build, then review the implementation task by task.",
  mood: "focused",
  state: "thinking",
};

const settingsStep: GuideStep = {
  target: "settings",
  title: "Make Jari yours",
  description:
    "Open Settings to try a new theme or customize the mascot you’ll see here and in provider activity. Open App guide whenever you want a refresher.",
  mood: "happy",
  state: "idle",
};

type Bounds = { left: number; top: number; width: number; height: number };

function useSpotlight(target: string, panel: React.RefObject<HTMLDivElement | null>) {
  const [placement, setPlacement] = useState<{ highlight?: Bounds; left: number; top: number }>();

  useLayoutEffect(() => {
    const element = document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
    const margin = 12;
    const gap = 16;

    function position() {
      if (!panel.current) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const { width, height } = panel.current.getBoundingClientRect();
      const placeX = (x: number) => Math.max(margin, Math.min(x, viewportWidth - width - margin));
      const placeY = (y: number) => Math.max(margin, Math.min(y, viewportHeight - height - margin));
      const rect = element?.getBoundingClientRect();
      if (
        !rect?.width ||
        !rect.height ||
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.top >= viewportHeight ||
        rect.left >= viewportWidth
      ) {
        setPlacement({
          left: placeX((viewportWidth - width) / 2),
          top: placeY((viewportHeight - height) / 2),
        });
        return;
      }

      const left = Math.max(0, rect.left - 4);
      const top = Math.max(0, rect.top - 4);
      const right = Math.min(viewportWidth, rect.right + 4);
      const bottom = Math.min(viewportHeight, rect.bottom + 4);
      const highlight = { left, top, width: right - left, height: bottom - top };
      const centeredX = placeX((left + right - width) / 2);
      if (bottom + gap + height <= viewportHeight - margin) {
        setPlacement({ highlight, left: centeredX, top: bottom + gap });
      } else if (top - gap - height >= margin) {
        setPlacement({ highlight, left: centeredX, top: top - gap - height });
      } else if (right + gap + width <= viewportWidth - margin) {
        setPlacement({ highlight, left: right + gap, top: placeY(top) });
      } else if (left - gap - width >= margin) {
        setPlacement({ highlight, left: left - gap - width, top: placeY(top) });
      } else {
        setPlacement({ left: centeredX, top: placeY((viewportHeight - height) / 2) });
      }
    }

    position();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(position);
    if (element) observer?.observe(element);
    if (panel.current) observer?.observe(panel.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [panel, target]);

  return placement;
}

export function AppGuide({ hasWorkflow, onClose }: { hasWorkflow: boolean; onClose(): void }) {
  const design = useContext(MascotDesignContext);
  const steps = [...introduction, ...(hasWorkflow ? canvasSteps : [onboardingStep]), settingsStep];
  const [index, setIndex] = useState(0);
  const step = steps[index] ?? settingsStep;
  const last = index >= steps.length - 1;
  const panel = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const placement = useSpotlight(step.target, panel);

  return createPortal(
    <div className="app-guide">
      {placement?.highlight ? (
        <div className="app-guide-spotlight" style={placement.highlight} aria-hidden="true" />
      ) : (
        <div className="app-guide-backdrop" aria-hidden="true" />
      )}
      <FocusTrap
        active
        onEscape={onClose}
        initialFocusRef={next}
        restoreFocus={false}
        containerRef={panel}
        className="app-guide-panel"
        style={{ left: placement?.left, top: placement?.top }}
      >
        <Card background="surface" border radius="xl" padding="20" fillWidth>
          <Column gap="16" fillWidth role="dialog" aria-modal="true" aria-label="App guide">
            <Row fillWidth horizontal="between" vertical="start">
              <Mascot
                {...mascotDesignProps(design)}
                state={step.state}
                mood={step.mood}
                lookAt="pointer"
                size={72}
                aria-hidden="true"
              />
              <IconButton
                type="button"
                size="s"
                variant="tertiary"
                icon="close"
                tooltip="Close app guide"
                aria-label="Close app guide"
                onClick={onClose}
              />
            </Row>
            <Column gap="8" aria-live="polite" aria-atomic="true">
              <Text textVariant="label-default-s" onBackground="brand-medium">
                Step {Math.min(index + 1, steps.length)} of {steps.length}
              </Text>
              <Heading as="h2" textVariant="heading-strong-l">
                {step.title}
              </Heading>
              <Text as="p" textVariant="body-default-s" onBackground="neutral-weak">
                {step.description}
              </Text>
            </Column>
            <ProgressBar
              aria-label="App guide progress"
              value={Math.min(index + 1, steps.length)}
              max={steps.length}
              showLabel={false}
              size="s"
            />
            <Row fillWidth horizontal="between" gap="8">
              <Button
                type="button"
                variant="secondary"
                size="s"
                disabled={index === 0}
                onClick={() => {
                  if (index === 1) next.current?.focus();
                  setIndex(index - 1);
                }}
              >
                Back
              </Button>
              <Button
                ref={next}
                type="button"
                size="s"
                onClick={last ? onClose : () => setIndex(index + 1)}
              >
                {last ? "Done" : "Next"}
              </Button>
            </Row>
          </Column>
        </Card>
      </FocusTrap>
    </div>,
    document.body,
  );
}
