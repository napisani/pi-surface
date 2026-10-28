// The PR feedback page: Feedback, Changes, Commits and Replies tabs.
import { Activity, useMemo, type ReactNode } from "react";
import { ErrorBoundary } from "../../../../web/kit/ErrorBoundary.tsx";
import { useHashChoice } from "../../../../web/kit/hooks/useHashState.ts";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { PageHeader, tabCount, type HeaderTab } from "../../../../web/kit/PageHeader.tsx";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { PageMain } from "../../../../web/kit/shell.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { FeedbackState } from "../state.ts";
import { ChangesTab } from "./ChangesTab.tsx";
import { CommitsTab } from "./CommitsTab.tsx";
import { FeedbackSendControl } from "./FeedbackSendControl.tsx";
import css from "./FeedbackPage.module.css";
import { FeedbackTab } from "./FeedbackTab.tsx";
import { useFeedback, usePost } from "./hooks.ts";
import { RepliesTab } from "./RepliesTab.tsx";
import { stageOf } from "./stage.ts";

type Tab = "feedback" | "changes" | "commits" | "replies";
const TABS: readonly Tab[] = ["feedback", "changes", "commits", "replies"];

const selectState = (s: FeedbackState) => s;

function tabsOf(s: FeedbackState): HeaderTab<Tab>[] {
  const visible = s.items.filter((i) => !i.hidden);
  const open = visible.filter((i) => stageOf(i) !== "done").length;
  const commits = s.commits.filter((c) => c.status !== "committed" || !c.pushed).length;
  const drafts = visible.filter((i) => i.reply && i.reply.status !== "posted").length;
  return [
    { id: "feedback", label: "Feedback", count: tabCount(open) },
    { id: "changes", label: "Changes", count: tabCount(s.files.length) },
    { id: "commits", label: "Commits", count: tabCount(commits, s.proposing.status === "running") },
    { id: "replies", label: "Replies", count: tabCount(drafts) },
  ];
}

function Title({ state }: { state: FeedbackState }) {
  const { target, pr } = state;
  if (pr) {
    return (
      <>
        <a className={css.title} href={pr.url} target="_blank" rel="noreferrer">
          <Text tone="faint">
            {pr.owner}/{pr.repo}
          </Text>{" "}
          #{pr.number} {pr.title}
        </a>
        <Text tone="faint" mono small>
          {pr.baseRef} ← {pr.headRef} · @{pr.author}
        </Text>
      </>
    );
  }
  return (
    <>
      <span className={css.title}>{target?.title}</span>
      <Text tone="faint" mono small>
        {target?.worktree.split("/").slice(-2).join("/")}
      </Text>
    </>
  );
}

function TabPanel({ name, visible, children }: { name: string; visible: boolean; children: ReactNode }) {
  return (
    <Activity mode={visible ? "visible" : "hidden"}>
      <ErrorBoundary name={name}>{children}</ErrorBoundary>
    </Activity>
  );
}

export function FeedbackPage() {
  const post = usePost();
  const state = useFeedback(selectState);
  const refreshing = usePending("refresh");
  const tabs = useMemo(() => tabsOf(state), [state]);
  const [tab, setTab] = useHashChoice<Tab>("tab", "feedback", TABS);
  const { target, pr } = state;
  return (
    <>
      <PageHeader
        brand="pr feedback"
        title={<Title state={state} />}
        actions={
          <>
            <Button size="small" title={`Reload your working tree${pr ? " and GitHub's feedback" : ""}`} disabled={refreshing} onClick={() => void post({ type: "refresh" }, "refresh")}>
              ↻ Refresh
            </Button>
            <FeedbackSendControl />
          </>
        }
        tabs={tabs}
        tab={tab}
        onTab={setTab}
      />
      <PageMain>
        {pr && target && target.branch !== pr.headRef ? (
          <Banner tone="warn">
            Your checkout is on {target.branch || "a detached HEAD"}, not the PR branch {pr.headRef}. Commits and pushes from this page go to the checkout's branch.
          </Banner>
        ) : null}
        {pr?.body.trim() && tab === "feedback" ? (
          <details className={css.prBody}>
            <summary>PR description</summary>
            <Markdown text={pr.body} />
          </details>
        ) : null}
        <TabPanel name="feedback" visible={tab === "feedback"}>
          <FeedbackTab />
        </TabPanel>
        {/* CodeView builds its viewer in a callback ref, so the Changes tab is hidden with CSS rather than an Activity. */}
        <section hidden={tab !== "changes"}>
          <ErrorBoundary name="changes">
            <ChangesTab />
          </ErrorBoundary>
        </section>
        <TabPanel name="commits" visible={tab === "commits"}>
          <CommitsTab />
        </TabPanel>
        <TabPanel name="replies" visible={tab === "replies"}>
          <RepliesTab />
        </TabPanel>
      </PageMain>
    </>
  );
}
