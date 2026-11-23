import { isWorkflowProvider, maxPlanAnswerLength, workflowProviders } from "@agent-desktop/shared";
import type {
  PlanningOptions,
  ReplayPlanInput,
  WorkflowApi,
  WorkflowProvider,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Checkbox } from "@once-ui-system/core/components/Checkbox";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Input } from "@once-ui-system/core/components/Input";
import { Select } from "@once-ui-system/core/components/Select";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useEffect, useId, useState } from "react";
import { workflowError } from "./workflow-error";

export function PlanReplay({
  workflow,
  loadOptions,
  replay,
}: {
  workflow: WorkflowRecord;
  loadOptions: WorkflowApi["planningOptions"];
  replay(input: ReplayPlanInput): Promise<void>;
}) {
  const canRevise = workflow.plan?.state === "ready";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReplayPlanInput["mode"]>(canRevise ? "revise" : "fresh");
  const [provider, setProvider] = useState(workflow.provider);
  const [model, setModel] = useState("");
  const [modelId, setModelId] = useState("");
  const [effort, setEffort] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState<{
    provider: WorkflowProvider;
    value?: PlanningOptions;
    error?: string;
  }>();
  const id = useId();
  const options = catalog?.provider === provider ? catalog : undefined;
  const efforts =
    options?.value?.models.find(({ id }) => id === model)?.efforts ?? options?.value?.efforts ?? [];

  useEffect(() => {
    if (!open || mode !== "fresh") return;
    let active = true;
    void loadOptions(provider, workflow.workspacePath, workflow.id).then(
      (value) => {
        if (active) setCatalog({ provider, value });
      },
      (failure: unknown) => {
        if (active)
          setCatalog({
            provider,
            error: workflowError(failure, "Planning options could not be loaded."),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [loadOptions, mode, open, provider, workflow.id, workflow.workspacePath]);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError("");
    const selectedModel = model === ":manual" ? modelId.trim() : model;
    try {
      await replay(
        mode === "revise"
          ? { mode, feedback: feedback.trim() }
          : {
              mode,
              provider,
              ...(selectedModel || effort || skills.length
                ? {
                    customPlan: {
                      model: selectedModel || undefined,
                      effort: effort || undefined,
                      skillIds: skills,
                    },
                  }
                : {}),
            },
      );
    } catch (failure) {
      setError(workflowError(failure, "Planning could not be replayed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Accordion title="Replay plan" onOpenChange={setOpen}>
      <Column
        as="form"
        gap="12"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Text textVariant="body-default-s" onBackground="neutral-weak">
          The replay uses this issue and workspace and creates a separate workflow.
        </Text>
        <Select
          id={`${id}-mode`}
          label="Replay mode"
          value={mode}
          disabled={pending}
          options={[
            ...(canRevise ? [{ value: "revise", label: "Revise the last plan" }] : []),
            { value: "fresh", label: "Start from scratch" },
          ]}
          onValueChange={(value) => {
            if (value === "fresh" || (value === "revise" && canRevise)) setMode(value);
          }}
        />
        {mode === "revise" ? (
          <Textarea
            id={`${id}-feedback`}
            label="What should change?"
            value={feedback}
            lines={4}
            maxLength={maxPlanAnswerLength}
            disabled={pending}
            onChange={(event) => setFeedback(event.currentTarget.value)}
          />
        ) : (
          <>
            <Select
              id={`${id}-provider`}
              label="Planning provider"
              value={provider}
              disabled={pending}
              options={Object.entries(workflowProviders).map(([value, label]) => ({
                value,
                label,
              }))}
              onValueChange={(value) => {
                if (!isWorkflowProvider(value) || value === provider) return;
                setProvider(value);
                setCatalog(undefined);
                setModel("");
                setModelId("");
                setEffort("");
                setSkills([]);
              }}
            />
            {options?.error && <Feedback tone="warning" description={options.error} />}
            {!options && open && <Text role="status">Loading models and skills…</Text>}
            <Select
              id={`${id}-model`}
              label="Model"
              value={model}
              disabled={pending}
              options={[
                { value: "", label: "Provider default" },
                ...(options?.value?.models.map(({ id, name }) => ({ value: id, label: name })) ??
                  []),
                { value: ":manual", label: "Enter a model ID" },
              ]}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setModel(value);
                  setEffort("");
                }
              }}
            />
            {model === ":manual" && (
              <Input
                id={`${id}-model-id`}
                label="Model ID"
                value={modelId}
                disabled={pending}
                onChange={(event) => setModelId(event.currentTarget.value)}
              />
            )}
            <Select
              id={`${id}-effort`}
              label="Effort"
              value={effort}
              disabled={pending || !efforts.length}
              options={[
                { value: "", label: "Provider default" },
                ...efforts.map(({ id, description }) => ({ value: id, label: id, description })),
              ]}
              onValueChange={(value) => {
                if (typeof value === "string") setEffort(value);
              }}
            />
            {!!options?.value?.skills.length && (
              <Column gap="8" maxHeight="12rem" overflowY="auto">
                <Text textVariant="label-default-s">Installed skills</Text>
                {options.value.skills.map(({ id, name, description }) => (
                  <Checkbox
                    key={id}
                    label={name}
                    description={description}
                    disabled={pending}
                    checked={skills.includes(id)}
                    onCheckedChange={(checked) =>
                      setSkills((previous) =>
                        checked ? [...previous, id] : previous.filter((skill) => skill !== id),
                      )
                    }
                  />
                ))}
              </Column>
            )}
          </>
        )}
        {error && <Feedback tone="danger" description={error} />}
        <Button
          type="submit"
          loading={pending}
          disabled={
            pending ||
            (mode === "revise" ? !feedback.trim() : model === ":manual" && !modelId.trim())
          }
        >
          {mode === "revise" ? "Revise plan" : "Start fresh plan"}
        </Button>
      </Column>
    </Accordion>
  );
}
