import {
  CONTRIBUTION_CALENDAR_QUERY,
  CONTRIBUTION_CALENDAR_VIEWER_QUERY,
} from "./query.js";

export type ContributionDay = {
  date: string;
  count: number;
};

type ContributionDayNode = {
  date: string;
  contributionCount: number;
};

type WeekNode = {
  contributionDays: ContributionDayNode[];
};

type ApiResponse = {
  data?: {
    user?: {
      contributionsCollection?: {
        contributionCalendar?: { weeks: WeekNode[] };
      };
    };
    viewer?: {
      contributionsCollection?: {
        contributionCalendar?: { weeks: WeekNode[] };
      };
    };
  };
  errors?: { message: string }[];
};

function getWeeks(json: ApiResponse): WeekNode[] | undefined {
  const fromUser =
    json.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  const fromViewer =
    json.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks;
  return fromUser ?? fromViewer;
}

/**
 * Returns weeks as 2D array: weeks[x][y]
 * x = week index, y = day index (0 = Sunday)
 * Each cell: { date, count }
 * If username is omitted, uses the authenticated user (viewer).
 */
export async function fetchContributionGrid(
  username?: string,
): Promise<ContributionDay[][]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token || typeof token !== "string") {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 1);
  const fromStr = from.toISOString();

  const useViewer = !username || username.trim() === "";
  const body = useViewer
    ? {
        query: CONTRIBUTION_CALENDAR_VIEWER_QUERY,
        variables: { from: fromStr, to },
      }
    : {
        query: CONTRIBUTION_CALENDAR_QUERY,
        variables: { login: username.trim(), from: fromStr, to },
      };

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`GitHub API HTTP ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse;

  if (json.errors?.length) {
    throw new Error(
      json.errors.map((e) => e.message).join("; ") || "GraphQL error",
    );
  }

  const weeks = getWeeks(json);
  if (!Array.isArray(weeks)) {
    throw new Error("Invalid API response: missing weeks");
  }

  const grid: ContributionDay[][] = weeks.map((week) => {
    const days = week.contributionDays ?? [];
    if (!Array.isArray(days)) {
      return [];
    }
    return days.map((d) => ({
      date: String(d?.date ?? ""),
      count: typeof d?.contributionCount === "number" ? d.contributionCount : 0,
    }));
  });

  return grid;
}
