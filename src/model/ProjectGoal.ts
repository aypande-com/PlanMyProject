export interface ProjectGoal {
  id: string;
  statement: string;
  successCriteria: string[];
  constraints: string[];
  outOfScope: string[];
}
