import type { WorkItem, WorkflowApi } from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Dialog } from "@once-ui-system/core/components/Dialog";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { useCallback, useState } from "react";
import { AtlassianDocument, JiraLink } from "./atlassian-document";
import { JiraDataStatus, readJiraResponse, useJiraQuery } from "./jira-query";

export function WorkItemPreview({
  issue,
  linkedIssueVariant,
  openJiraLink,
  loadIssue,
}: {
  issue: WorkItem;
  linkedIssueVariant?: "sheet";
  openJiraLink: WorkflowApi["openJiraLink"];
  loadIssue: WorkflowApi["linkedIssue"];
}) {
  const [trail, setTrail] = useState<string[]>([]);
  const linkedKey = trail.at(-1);

  function inspectIssue(key: string) {
    setTrail((previous) => {
      if (key === issue.key) return [];
      const index = previous.indexOf(key);
      return index === -1 ? [...previous, key] : previous.slice(0, index + 1);
    });
  }

  return (
    <>
      <IssueDetails
        issue={issue}
        openJiraLink={openJiraLink}
        loadIssue={loadIssue}
        onInspect={inspectIssue}
      />
      {linkedKey && (
        <Dialog
          open
          stack
          variant={linkedIssueVariant}
          title={`Linked issue ${linkedKey}`}
          onClose={() => setTrail([])}
          maxWidth="44rem"
          footer={
            trail.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                prefixIcon="arrowLeft"
                onClick={() => setTrail((previous) => previous.slice(0, -1))}
              >
                Back to {trail.at(-2)}
              </Button>
            )
          }
        >
          <LinkedIssueDetails
            key={linkedKey}
            issueKey={linkedKey}
            loadIssue={loadIssue}
            openJiraLink={openJiraLink}
            onInspect={inspectIssue}
          />
        </Dialog>
      )}
    </>
  );
}

function LinkedIssueDetails({
  issueKey,
  loadIssue,
  openJiraLink,
  onInspect,
}: {
  issueKey: string;
  loadIssue: WorkflowApi["linkedIssue"];
  openJiraLink: WorkflowApi["openJiraLink"];
  onInspect(key: string): void;
}) {
  const load = useCallback((sync: boolean) => loadIssue(issueKey, sync), [issueKey, loadIssue]);
  const { response, pending, error, sync } = useJiraQuery(load);

  if (response) {
    return (
      <Column gap="12">
        <Row horizontal="between" vertical="center" gap="8" wrap>
          <JiraDataStatus response={response} />
          <Button
            type="button"
            variant="secondary"
            size="s"
            prefixIcon="refresh"
            disabled={pending}
            onClick={sync}
          >
            {pending ? "Syncing…" : "Sync"}
          </Button>
        </Row>
        {response.syncError && (
          <Feedback
            tone="warning"
            title="Sync failed. Showing cached data."
            description={response.syncError}
          />
        )}
        <IssueDetails
          issue={response.data}
          openJiraLink={openJiraLink}
          loadIssue={loadIssue}
          onInspect={onInspect}
        />
      </Column>
    );
  }
  if (error) {
    return (
      <Feedback tone="danger" title="Linked issue could not be loaded" description={error}>
        <Row>
          <Button type="button" variant="secondary" onClick={sync}>
            Retry
          </Button>
        </Row>
      </Feedback>
    );
  }
  return (
    <Text role="status" textVariant="body-default-s">
      Loading linked issue…
    </Text>
  );
}

function IssueDetails({
  issue,
  openJiraLink,
  loadIssue,
  onInspect,
}: {
  issue: WorkItem;
  openJiraLink: WorkflowApi["openJiraLink"];
  loadIssue: WorkflowApi["linkedIssue"];
  onInspect(key: string): void;
}) {
  const [linkError, setLinkError] = useState(false);
  const [checkedLinks, setCheckedLinks] = useState<WorkItem["linkedIssues"]>();
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const linkedIssues = issue.linkedIssues ?? checkedLinks;

  async function checkLinkedIssues() {
    setCheckFailed(false);
    setCheckingLinks(true);
    try {
      const latest = readJiraResponse<WorkItem>(await loadIssue(issue.key, true));
      if (latest.syncError) throw new Error(latest.syncError);
      setCheckedLinks(latest.data.linkedIssues ?? []);
    } catch {
      setCheckFailed(true);
    } finally {
      setCheckingLinks(false);
    }
  }

  function openLink(url: string) {
    setLinkError(false);
    void openJiraLink(url).catch(() => setLinkError(true));
  }

  return (
    <Column
      as="section"
      aria-label={`${issue.kind === "simulated" ? "Simulated issue" : "Jira issue"} ${issue.key}`}
      borderTop
      paddingY="12"
      gap="12"
      minWidth="0"
    >
      <Column gap="4">
        <Heading as="h3" textVariant="heading-strong-s">
          {issue.key} · {issue.title}
        </Heading>
        <Row
          gap="8"
          vertical="center"
          wrap
          textVariant="label-default-s"
          onBackground="neutral-weak"
        >
          <Text textVariant="label-default-s">{issue.status}</Text>
          {issue.url && (
            <JiraLink href={issue.url} baseUrl={issue.url} openLink={openLink}>
              Open in Jira
            </JiraLink>
          )}
        </Row>
      </Column>
      <AtlassianDocument
        document={issue.descriptionDocument}
        text={issue.description || "No description was provided."}
        baseUrl={issue.url ?? ""}
        openLink={openLink}
      />
      {linkedIssues === undefined ? (
        <Column gap="8">
          <Row>
            <Button
              type="button"
              size="s"
              variant="secondary"
              loading={checkingLinks}
              onClick={() => void checkLinkedIssues()}
            >
              Check linked issues
            </Button>
          </Row>
          {checkFailed && (
            <Feedback tone="danger" description="Linked issues could not be checked. Try again." />
          )}
        </Column>
      ) : linkedIssues.length ? (
        <Accordion
          title={`Linked issues (${linkedIssues.length})`}
          titleVariant="label-default-s"
          defaultOpen
        >
          <Column gap="8">
            {linkedIssues.map(({ key, relationship, title, status }, index) => (
              <Column key={`${key}-${index}`} gap="4">
                <Text textVariant="label-default-s" onBackground="neutral-weak">
                  {relationship}
                  {status ? ` · ${status}` : ""}
                </Text>
                <Button
                  type="button"
                  size="s"
                  variant="secondary"
                  horizontal="start"
                  onClick={() => onInspect(key)}
                >
                  {key}
                  {title ? ` · ${title}` : ""}
                </Button>
              </Column>
            ))}
          </Column>
        </Accordion>
      ) : checkedLinks ? (
        <Text textVariant="body-default-s" onBackground="neutral-weak">
          No linked issues found.
        </Text>
      ) : null}
      {issue.comments.length > 0 && (
        <Accordion title={`Comments (${issue.comments.length})`} titleVariant="label-default-s">
          <Column gap="16" minWidth="0">
            {issue.comments.map(({ author, body, document }, index) => (
              <Column key={index} gap="4" minWidth="0">
                <Text textVariant="label-strong-s">{author}</Text>
                <AtlassianDocument
                  document={document}
                  text={body}
                  baseUrl={issue.url ?? ""}
                  openLink={openLink}
                />
              </Column>
            ))}
          </Column>
        </Accordion>
      )}
      {issue.references.length > 0 && (
        <Accordion title={`References (${issue.references.length})`} titleVariant="label-default-s">
          <Column gap="16" minWidth="0">
            {issue.references.map(({ title, url, text, document, unavailable }) => (
              <Column key={url} gap="4" minWidth="0">
                <Text as="p" textVariant="label-strong-s" className="request-body">
                  <JiraLink href={url} baseUrl={issue.url ?? ""} openLink={openLink}>
                    {title}
                  </JiraLink>
                </Text>
                {unavailable && (
                  <Text as="p" textVariant="body-default-s">
                    This Confluence page could not be read with the configured access.
                  </Text>
                )}
                {(text || document) && (
                  <AtlassianDocument
                    document={document}
                    text={text ?? ""}
                    baseUrl={url}
                    openLink={openLink}
                  />
                )}
              </Column>
            ))}
          </Column>
        </Accordion>
      )}
      {linkError && (
        <Feedback tone="danger" description="The link could not be opened in your browser." />
      )}
    </Column>
  );
}
