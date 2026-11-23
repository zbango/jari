import { workflowProviders } from "@agent-desktop/shared";
import type { DesktopInfo, WorkflowApi, WorkflowProvider } from "@agent-desktop/shared";
import { useLayout, useToast } from "@once-ui-system/core";
import type { MascotDesign } from "@once-ui-system/core";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Line } from "@once-ui-system/core/components/Line";
import { Logo } from "@once-ui-system/core/components/Logo";
import { Row } from "@once-ui-system/core/components/Row";
import { SegmentedControl } from "@once-ui-system/core/components/SegmentedControl";
import { Setting } from "@once-ui-system/core/components/Setting";
import { Tab, TabList, TabPanel, Tabs } from "@once-ui-system/core/components/Tabs";
import { Text } from "@once-ui-system/core/components/Text";
import { useContext, useEffect, useRef, useState } from "react";
import icon from "../../../resources/icon.png?url";
import { MascotSettings } from "./mascot-settings";
import { ThemeSettings } from "./theme-settings";
import { MascotDesignContext } from "./workflow/provider-activity";
import { workflowError } from "./workflow/workflow-error";

type JiraCheck = { state: "checking" | "success" } | { state: "error"; message: string };

const providers = (["codex", "claude"] as const).map((value) => ({
  value,
  label: workflowProviders[value],
}));

export function SettingsPage({
  desktop,
  checkJira,
  defaultProvider,
  onProviderChange,
  onMascotChange,
  onBack,
}: {
  desktop: DesktopInfo;
  checkJira: WorkflowApi["assignedSprintIssues"];
  defaultProvider: WorkflowProvider;
  onProviderChange(provider: WorkflowProvider): void;
  onMascotChange(design: MascotDesign): void;
  onBack(): void;
}) {
  const [jira, setJira] = useState<JiraCheck>();
  const firstTab = useRef<HTMLElement>(null);
  const { maxWidth } = useLayout();
  const { addToast } = useToast();
  const mascotDesign = useContext(MascotDesignContext);

  useEffect(() => {
    firstTab.current?.focus();
  }, []);

  async function verifyJira() {
    setJira({ state: "checking" });
    try {
      const response = await checkJira();
      if (response.syncError) throw new Error(response.syncError);
      setJira({ state: "success" });
    } catch (error) {
      setJira({ state: "error", message: workflowError(error, "Jira could not be reached.") });
    }
  }

  return (
    <Column minHeight="100dvh" fillWidth background="page">
      <Row
        as="header"
        fillWidth
        background="surface"
        borderBottom
        paddingY="8"
        paddingX="32"
        horizontal="between"
        vertical="center"
        gap="16"
        s={{ paddingX: "16" }}
      >
        <Row vertical="center" gap="16">
          <Logo icon={icon} text={desktop.name} />
          <Line vert height="20" />
          <Text textVariant="body-default-s" onBackground="neutral-weak">
            Version {desktop.version}
          </Text>
        </Row>
        <Button type="button" variant="tertiary" prefixIcon="arrowLeft" onClick={onBack}>
          Back to workflows
        </Button>
      </Row>

      <Column
        as="main"
        fillWidth
        horizontal="center"
        paddingX="32"
        paddingY="48"
        s={{ paddingX: "16", paddingY: "24" }}
      >
        <Column maxWidth="64rem" gap="32">
          <Heading as="h1" textVariant="display-strong-s">
            Settings
          </Heading>

          <Tabs
            defaultValue="appearance"
            fillWidth
            orientation={maxWidth("s") ? "horizontal" : "vertical"}
            gap="24"
            vertical="start"
          >
            <TabList
              aria-label="Settings sections"
              minWidth="14rem"
              padding="12"
              gap="4"
              background="surface"
              border
              radius="l"
              s={{ fillWidth: true }}
            >
              <Tab ref={firstTab} value="appearance" prefixIcon="light" tone="brand">
                Appearance
              </Tab>
              <Tab value="mascot" tone="brand">
                Mascot
              </Tab>
              <Tab value="workflows" prefixIcon="grid" tone="brand">
                Workflows
              </Tab>
              <Tab value="jira" prefixIcon="link" tone="brand">
                Jira
              </Tab>
            </TabList>

            <TabPanel value="appearance" fillWidth minWidth="0">
              <ThemeSettings />
            </TabPanel>

            <TabPanel value="mascot" background="surface" border radius="l" padding="24">
              <MascotSettings design={mascotDesign} onChange={onMascotChange} />
            </TabPanel>

            <TabPanel
              value="workflows"
              background="surface"
              border
              radius="l"
              padding="24"
              gap="16"
            >
              <Heading as="h2" textVariant="display-strong-xs">
                Workflows
              </Heading>
              <Setting
                label="Default provider"
                description="Preselect this provider when starting a new plan."
              >
                <SegmentedControl
                  aria-label="Default provider"
                  semantics="radio"
                  buttons={providers}
                  value={defaultProvider}
                  onValueChange={(value) => {
                    const provider = providers.find((option) => option.value === value)?.value;
                    if (!provider) return;
                    try {
                      onProviderChange(provider);
                    } catch {
                      addToast({
                        tone: "danger",
                        message: "The provider preference could not be saved.",
                      });
                    }
                  }}
                />
              </Setting>
            </TabPanel>

            <TabPanel value="jira" background="surface" border radius="l" padding="24" gap="16">
              <Heading as="h2" textVariant="display-strong-xs">
                Jira
              </Heading>
              <Setting
                label="Connection"
                description="Verify that the configured Atlassian account can search for assigned sprint issues."
              >
                <Button
                  type="button"
                  variant="secondary"
                  prefixIcon="refresh"
                  loading={jira?.state === "checking"}
                  onClick={() => void verifyJira()}
                >
                  {jira?.state === "error" ? "Retry connection" : "Test connection"}
                </Button>
              </Setting>
              {jira?.state === "success" && (
                <Feedback
                  tone="success"
                  title="Connected to Jira"
                  description="The assigned-issues search succeeded."
                />
              )}
              {jira?.state === "error" && (
                <Feedback tone="danger" title="Jira connection failed" description={jira.message} />
              )}
            </TabPanel>
          </Tabs>
        </Column>
      </Column>
    </Column>
  );
}
