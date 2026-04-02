import { tool } from "ai";
import { z } from "zod";
import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { withGitHubAccess } from "@/lib/auth0-ai";
import type { LooseEnd, UrgencyLevel } from "@/lib/types";

const GITHUB_API = "https://api.github.com";

function getUrgencyByAge(daysOld: number): UrgencyLevel {
  if (daysOld > 7) return "red";
  if (daysOld > 3) return "yellow";
  return "green";
}

function formatAge(daysOld: number): string {
  if (daysOld === 0) return "today";
  if (daysOld === 1) return "1 day ago";
  return `${daysOld} days ago`;
}

async function githubFetch(path: string, token: string) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export const scanGitHub = withGitHubAccess(
  tool({
    description:
      "Scan GitHub for pending review requests on pull requests and stale issues assigned to the user.",
    inputSchema: z.object({
      staleDays: z
        .number()
        .default(7)
        .describe(
          "Number of days of inactivity before an issue is considered stale"
        ),
    }),
    execute: async ({ staleDays }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const looseEnds: LooseEnd[] = [];

      // Get current user
      const user = await githubFetch("/user", accessToken);
      const username: string = user.login;

      // Search for open PRs where user is a requested reviewer
      const prSearchQuery = `type:pr state:open review-requested:${username}`;
      const prResults = await githubFetch(
        `/search/issues?q=${encodeURIComponent(prSearchQuery)}&sort=created&order=desc&per_page=50`,
        accessToken
      );

      for (const pr of prResults.items ?? []) {
        const createdAt = new Date(pr.created_at);
        const daysOld = Math.floor(
          (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Extract repo name from the repository_url
        const repoMatch = pr.repository_url?.match(
          /repos\/(.+)/
        );
        const repoName = repoMatch ? repoMatch[1] : "unknown";

        looseEnds.push({
          id: `gh-pr-${pr.id}`,
          type: "github",
          title: `PR review: ${pr.title}`,
          description: `Review requested on ${repoName}#${pr.number}`,
          urgency: getUrgencyByAge(daysOld),
          age: formatAge(daysOld),
          source: "GitHub",
          actionLabel: "Review PR",
          meta: {
            prNumber: String(pr.number),
            repo: repoName,
            url: pr.html_url ?? "",
            author: pr.user?.login ?? "",
          },
        });
      }

      // Search for stale open issues assigned to user
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - staleDays);
      const staleDateStr = staleDate.toISOString().split("T")[0];

      const issueSearchQuery = `type:issue state:open assignee:${username} updated:<${staleDateStr}`;
      const issueResults = await githubFetch(
        `/search/issues?q=${encodeURIComponent(issueSearchQuery)}&sort=updated&order=asc&per_page=50`,
        accessToken
      );

      for (const issue of issueResults.items ?? []) {
        const updatedAt = new Date(issue.updated_at);
        const daysSinceUpdate = Math.floor(
          (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        const repoMatch = issue.repository_url?.match(
          /repos\/(.+)/
        );
        const repoName = repoMatch ? repoMatch[1] : "unknown";

        looseEnds.push({
          id: `gh-issue-${issue.id}`,
          type: "github",
          title: `Stale issue: ${issue.title}`,
          description: `No activity for ${daysSinceUpdate} days on ${repoName}#${issue.number}`,
          urgency: getUrgencyByAge(daysSinceUpdate),
          age: formatAge(daysSinceUpdate),
          source: "GitHub",
          actionLabel: "Update issue",
          meta: {
            issueNumber: String(issue.number),
            repo: repoName,
            url: issue.html_url ?? "",
            lastUpdated: issue.updated_at ?? "",
          },
        });
      }

      return looseEnds;
    },
  })
);
