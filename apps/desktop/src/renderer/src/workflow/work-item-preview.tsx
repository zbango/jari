import type { WorkItem, WorkflowApi } from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { useState } from "react";
import { AtlassianDocument, JiraLink } from "./atlassian-document";

export function WorkItemPreview({
  issue,
  openJiraLink,
}: {
  issue: WorkItem;
  openJiraLink: WorkflowApi["openJiraLink"];
}) {
  const [linkError, setLinkError] = useState(false);

  function openLink(url: string) {
    setLinkError(false);
    void openJiraLink(url).catch(() => setLinkError(true));
  }

  return (
    <Column
      as="section"
      aria-label={`Jira issue ${issue.key}`}
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
          <JiraLink href={issue.url} baseUrl={issue.url} openLink={openLink}>
            Open in Jira
          </JiraLink>
        </Row>
      </Column>
      <AtlassianDocument
        document={issue.descriptionDocument}
        text={issue.description || "No description was provided."}
        baseUrl={issue.url}
        openLink={openLink}
      />
      {issue.comments.length > 0 && (
        <Accordion title={`Comments (${issue.comments.length})`} titleVariant="label-default-s">
          <Column gap="16" minWidth="0">
            {issue.comments.map(({ author, body, document }, index) => (
              <Column key={index} gap="4" minWidth="0">
                <Text textVariant="label-strong-s">{author}</Text>
                <AtlassianDocument
                  document={document}
                  text={body}
                  baseUrl={issue.url}
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
                  <JiraLink href={url} baseUrl={issue.url} openLink={openLink}>
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
