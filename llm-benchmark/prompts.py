"""
CueAI comprehensive question bank.

Every model receives these questions in the EXACT SAME order.
Categories (12) with at least 5 questions each (>= 60 total).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

EvalType = Literal[
    "conceptual",
    "coding",
    "debugging",
    "factual",
    "sql",
    "aptitude",
    "logical",
    "behavioral",
]


@dataclass(frozen=True)
class PromptCase:
    id: str
    category: str
    text: str
    expected_keywords: tuple[str, ...] = ()
    expected_answer: str = ""
    eval_type: EvalType = "conceptual"
    coding_checks: tuple[str, ...] = ()
    # For aptitude/logical: accept any of these normalized answer tokens
    accepted_answers: tuple[str, ...] = ()


def _q(
    n: int,
    category: str,
    text: str,
    *,
    keywords: tuple[str, ...] = (),
    expected: str = "",
    eval_type: EvalType = "conceptual",
    coding_checks: tuple[str, ...] = (),
    accepted: tuple[str, ...] = (),
) -> PromptCase:
    return PromptCase(
        id=f"Q{n:02d}",
        category=category,
        text=text,
        expected_keywords=keywords,
        expected_answer=expected,
        eval_type=eval_type,
        coding_checks=coding_checks,
        accepted_answers=accepted,
    )


# ---------------------------------------------------------------------------
# Full ordered bank — DO NOT reorder casually; all models share this order
# ---------------------------------------------------------------------------

PROMPTS: list[PromptCase] = [
    # ========== 1. TECHNICAL QUESTIONS (10) ==========
    _q(
        1,
        "TECHNICAL",
        "What is a REST API? Explain in 3 short points.",
        keywords=("rest", "http", "resource", "api", "stateless"),
        expected="REST uses HTTP methods on resources in a mostly stateless way.",
    ),
    _q(
        2,
        "TECHNICAL",
        "Explain the difference between HTTP and HTTPS.",
        keywords=("http", "https", "tls", "ssl", "encrypt", "secure"),
        expected="HTTPS is HTTP secured with TLS/SSL encryption.",
        eval_type="factual",
    ),
    _q(
        3,
        "TECHNICAL",
        "What is polymorphism in OOP? Give one short example.",
        keywords=("polymorphism", "same", "different", "override", "interface"),
        expected="Same interface, different implementations (e.g. method override).",
    ),
    _q(
        4,
        "TECHNICAL",
        "Explain inheritance in object-oriented programming.",
        keywords=("inherit", "parent", "child", "base", "subclass", "reuse"),
        expected="A class reuses/extends another class's fields and methods.",
    ),
    _q(
        5,
        "TECHNICAL",
        "What is encapsulation? Why does it matter?",
        keywords=("encapsul", "private", "hide", "access", "bundle", "data"),
        expected="Bundling data with methods and restricting direct access.",
    ),
    _q(
        6,
        "TECHNICAL",
        "What is database normalization?",
        keywords=("normal", "redundant", "anomaly", "form", "dependency"),
        expected="Organize tables to reduce redundancy and update anomalies.",
    ),
    _q(
        7,
        "TECHNICAL",
        "What is indexing in SQL?",
        keywords=("index", "lookup", "speed", "query", "search"),
        expected="Indexes speed up lookups/filters at some write cost.",
    ),
    _q(
        8,
        "TECHNICAL",
        "What is an API endpoint?",
        keywords=("endpoint", "url", "path", "resource", "api"),
        expected="A specific URL/path exposing an API resource or action.",
        eval_type="factual",
    ),
    _q(
        9,
        "TECHNICAL",
        "What is Docker in one short paragraph?",
        keywords=("docker", "container", "image", "package", "runtime"),
        expected="Docker packages apps into portable containers.",
        eval_type="factual",
    ),
    _q(
        10,
        "TECHNICAL",
        "What is an LLM?",
        keywords=("large", "language", "model", "text", "token"),
        expected="A Large Language Model that predicts/generates text.",
        eval_type="factual",
    ),
    # ========== 2. APTITUDE QUESTIONS (8) — verified answers ==========
    _q(
        11,
        "APTITUDE",
        "A train travels 120 km in 2 hours. What is its average speed in km/h? "
        "Reply with the number only, then one line of work.",
        keywords=("60", "speed"),
        expected="60",
        eval_type="aptitude",
        accepted=("60", "60 km/h", "60km/h", "60 kmph"),
    ),
    _q(
        12,
        "APTITUDE",
        "A number is increased by 20% and then decreased by 20%. What is the net percentage change? "
        "Reply with the signed percentage (e.g. -4%).",
        keywords=("-4", "4%", "decrease"),
        expected="-4%",
        eval_type="aptitude",
        accepted=("-4%", "-4", "4% decrease", "decrease of 4%", "net decrease of 4%"),
    ),
    _q(
        13,
        "APTITUDE",
        "A product costs Rs.800 and is sold at a 15% profit. What is the selling price in rupees? Number only.",
        keywords=("920",),
        expected="920",
        eval_type="aptitude",
        accepted=("920", "rs 920", "rs.920", "inr 920"),
    ),
    _q(
        14,
        "APTITUDE",
        "A can complete a task in 10 days and B in 15 days. How many days will they take together? "
        "Reply with days (fraction ok, e.g. 6).",
        keywords=("6",),
        expected="6",
        eval_type="aptitude",
        accepted=("6", "6 days", "6 day"),
    ),
    _q(
        15,
        "APTITUDE",
        "Find the next number in the series: 2, 6, 12, 20, 30, ?",
        keywords=("42",),
        expected="42",
        eval_type="aptitude",
        accepted=("42",),
    ),
    _q(
        16,
        "APTITUDE",
        "A bag has 3 red and 2 blue balls. Probability of drawing one red ball at random? "
        "Reply as a simplified fraction.",
        keywords=("3/5", "0.6"),
        expected="3/5",
        eval_type="aptitude",
        accepted=("3/5", "0.6", "60%"),
    ),
    _q(
        17,
        "APTITUDE",
        "The average of 5 numbers is 20. If one number 30 is removed, what is the new average?",
        keywords=("17.5", "35/2"),
        expected="17.5",
        eval_type="aptitude",
        accepted=("17.5", "35/2", "17.50"),
    ),
    _q(
        18,
        "APTITUDE",
        "Simplify the ratio 36:48 to lowest terms.",
        keywords=("3:4", "3/4"),
        expected="3:4",
        eval_type="aptitude",
        accepted=("3:4", "3/4", "3 to 4"),
    ),
    # ========== 3. LOGICAL REASONING (6) ==========
    _q(
        19,
        "LOGICAL_REASONING",
        "Find the next number: 3, 9, 27, 81, ?",
        keywords=("243",),
        expected="243",
        eval_type="logical",
        accepted=("243",),
    ),
    _q(
        20,
        "LOGICAL_REASONING",
        "Dog is to Bark as Cat is to ? Reply with one word.",
        keywords=("meow", "mew"),
        expected="Meow",
        eval_type="logical",
        accepted=("meow", "mew", "purr"),
    ),
    _q(
        21,
        "LOGICAL_REASONING",
        "A is taller than B. B is taller than C. Who is the shortest?",
        keywords=("c",),
        expected="C",
        eval_type="logical",
        accepted=("c", "c is shortest", "person c"),
    ),
    _q(
        22,
        "LOGICAL_REASONING",
        "You face North, turn right, walk, turn right again. Which direction are you facing now?",
        keywords=("south",),
        expected="South",
        eval_type="logical",
        accepted=("south",),
    ),
    _q(
        23,
        "LOGICAL_REASONING",
        "Pointing to a photo, a man says: 'He is the son of my mother's only son.' "
        "Who is in the photo relative to the man?",
        keywords=("son", "himself", "own son"),
        expected="His son (or himself if photo is himself — preferred: his son)",
        eval_type="logical",
        accepted=("son", "his son", "own son", "the man's son"),
    ),
    _q(
        24,
        "LOGICAL_REASONING",
        "All APIs are services. All services need interfaces. Conclusion: All APIs need interfaces. "
        "Does this follow? Answer YES or NO with one reason.",
        keywords=("yes", "interface"),
        expected="YES — transitive: APIs are services and services need interfaces.",
        eval_type="logical",
        accepted=("yes",),
    ),
    # ========== 4. CODING QUESTIONS (8) ==========
    _q(
        25,
        "CODING",
        "Write a Python function to reverse a string without using reversed(). "
        "Also state time complexity in Big-O.",
        keywords=("def", "return", "o(n)", "::-1"),
        expected="Use slicing or a loop; O(n).",
        eval_type="coding",
        coding_checks=("def", "return", "o("),
    ),
    _q(
        26,
        "CODING",
        "Write a Python function is_prime(n) that returns True if n is prime. Mention Big-O.",
        keywords=("def", "prime", "return", "%"),
        expected="Trial division with early exits; typically O(sqrt n).",
        eval_type="coding",
        coding_checks=("def", "return", "%"),
    ),
    _q(
        27,
        "CODING",
        "Write a Python function that returns duplicate values from a list.",
        keywords=("def", "duplicate", "set", "return"),
        expected="Return values appearing more than once.",
        eval_type="coding",
        coding_checks=("def", "return"),
    ),
    _q(
        28,
        "CODING",
        "Write a Python function to find the second-largest distinct number in a list.",
        keywords=("def", "second", "max", "return"),
        expected="Track largest and second-largest distinct values.",
        eval_type="coding",
        coding_checks=("def", "return"),
    ),
    _q(
        29,
        "CODING",
        "Write a Python function is_palindrome(s) ignoring spaces and case.",
        keywords=("def", "palindrome", "return", "lower"),
        expected="Normalize then compare to reverse.",
        eval_type="coding",
        coding_checks=("def", "return"),
    ),
    _q(
        30,
        "CODING",
        "Write a Python function that returns a frequency dict of list elements.",
        keywords=("def", "count", "dict", "return"),
        expected="Map each element to its count.",
        eval_type="coding",
        coding_checks=("def", "return"),
    ),
    _q(
        31,
        "CODING",
        "Implement binary search in Python on a sorted list. Return index or -1. State Big-O.",
        keywords=("def", "mid", "left", "right", "o(log"),
        expected="Iterative/recursive binary search; O(log n).",
        eval_type="coding",
        coding_checks=("def", "return", "mid"),
    ),
    _q(
        32,
        "CODING",
        "Given nums containing n distinct numbers from 0..n, write Python to find the missing number. "
        "State Big-O.",
        keywords=("def", "missing", "sum", "xor", "return"),
        expected="Use sum formula or XOR; O(n).",
        eval_type="coding",
        coding_checks=("def", "return"),
    ),
    # ========== 5. DEBUGGING QUESTIONS (5) ==========
    _q(
        33,
        "DEBUGGING",
        "Find and fix the bug:\n"
        "```python\n"
        "numbers = [1, 2, 3, 4, 5]\n"
        "for i in range(len(numbers)):\n"
        "    print(numbers[i+1])\n"
        "```\n"
        "Explain the error and give corrected code.",
        keywords=("indexerror", "i+1", "range", "len", "off-by", "bounds"),
        expected="IndexError: i+1 goes past last index. Use range(len-1) or print(numbers[i]).",
        eval_type="debugging",
        coding_checks=("index", "i+1", "range"),
    ),
    _q(
        34,
        "DEBUGGING",
        "Find the bug:\n`for i in range(5) print(i)`\nExplain and fix.",
        keywords=("colon", "syntax", ":"),
        expected="Missing colon after for-header: `for i in range(5): print(i)`",
        eval_type="debugging",
        coding_checks=("colon", ":"),
    ),
    _q(
        35,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\ndef add(a, b):\n    return a + b\nprint(add(2))\n```\n"
        "Explain and fix.",
        keywords=("argument", "missing", "parameter", "typeerror", "b"),
        expected="TypeError: missing required argument b. Call add(2, 3) or give default.",
        eval_type="debugging",
        coding_checks=("argument", "parameter"),
    ),
    _q(
        36,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\ndata = {'a': 1}\nprint(data['b'])\n```\n"
        "Explain safer access.",
        keywords=("keyerror", "get", "b", "missing"),
        expected="KeyError for missing key; use .get('b') or membership check.",
        eval_type="debugging",
        coding_checks=("keyerror", "get"),
    ),
    _q(
        37,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\nx = 0\nwhile x < 5:\n    print(x)\n```\n"
        "Explain and fix.",
        keywords=("infinite", "increment", "x +=", "x = x"),
        expected="Infinite loop: x never increments. Add x += 1 inside loop.",
        eval_type="debugging",
        coding_checks=("infinite", "increment", "+="),
    ),
    # ========== 6. SQL / DATABASE (5) ==========
    _q(
        38,
        "SQL_DATABASE",
        "Write SQL to find the second-highest salary from employees(salary).",
        keywords=("select", "salary", "max", "order", "limit", "dense_rank", "distinct"),
        expected="Use subquery MAX, ORDER BY LIMIT, or DENSE_RANK.",
        eval_type="sql",
        coding_checks=("select", "salary"),
    ),
    _q(
        39,
        "SQL_DATABASE",
        "What is an SQL JOIN? Name INNER vs LEFT briefly.",
        keywords=("join", "inner", "left", "table", "match"),
        expected="JOIN combines rows; INNER only matches; LEFT keeps all left rows.",
    ),
    _q(
        40,
        "SQL_DATABASE",
        "Write a SELECT that returns employees with salary > 50000 from employees(name, salary).",
        keywords=("select", "where", "salary", "50000"),
        expected="SELECT name, salary FROM employees WHERE salary > 50000;",
        eval_type="sql",
        coding_checks=("select", "where", "salary"),
    ),
    _q(
        41,
        "SQL_DATABASE",
        "What is a primary key vs a foreign key?",
        keywords=("primary", "foreign", "unique", "reference", "table"),
        expected="PK uniquely identifies a row; FK references another table's key.",
    ),
    _q(
        42,
        "SQL_DATABASE",
        "Explain ACID in databases in 4 short bullets.",
        keywords=("atomic", "consist", "isolat", "durab"),
        expected="Atomicity, Consistency, Isolation, Durability.",
    ),
    # ========== 7. COMPUTER SCIENCE (5) ==========
    _q(
        43,
        "COMPUTER_SCIENCE",
        "Explain Big-O notation in 3 bullets.",
        keywords=("big-o", "complexity", "growth", "input", "o("),
        expected="Asymptotic upper bound of resource growth vs input size.",
    ),
    _q(
        44,
        "COMPUTER_SCIENCE",
        "What is the difference between TCP and UDP?",
        keywords=("tcp", "udp", "reliable", "connection", "fast"),
        expected="TCP reliable/connection-oriented; UDP connectionless/faster.",
        eval_type="factual",
    ),
    _q(
        45,
        "COMPUTER_SCIENCE",
        "What is a stack? Give push/pop and one use case.",
        keywords=("stack", "push", "pop", "lifo"),
        expected="LIFO structure; e.g. undo stack / call stack.",
    ),
    _q(
        46,
        "COMPUTER_SCIENCE",
        "What is the time complexity of binary search on a sorted array?",
        keywords=("o(log", "log n", "logarithmic"),
        expected="O(log n)",
        eval_type="factual",
        accepted=("o(log n)", "log n", "o(logn)"),
    ),
    _q(
        47,
        "COMPUTER_SCIENCE",
        "Explain process vs thread in one short paragraph.",
        keywords=("process", "thread", "memory", "share", "os"),
        expected="Process is isolated; threads share process memory.",
    ),
    # ========== 8. SCENARIO-BASED (5) ==========
    _q(
        48,
        "SCENARIO",
        "CueAI auto-answer never fires after a final System transcript. "
        "List 4 likely causes to check.",
        keywords=("dedupe", "transcript", "meeting", "permission", "error", "stream", "gate"),
        expected="Check dedupe, meetingId, permissions, empty transcript, API errors, gates.",
    ),
    _q(
        49,
        "SCENARIO",
        "Your REST API returns 429 often during demos. Give 4 practical mitigations.",
        keywords=("rate", "retry", "backoff", "cache", "limit", "queue"),
        expected="Backoff retries, caching, request coalescing, higher limits, queueing.",
    ),
    _q(
        50,
        "SCENARIO",
        "A production DB query is slow only for one report. How do you diagnose in 5 steps?",
        keywords=("explain", "index", "slow", "query", "profile", "plan"),
        expected="Capture query, EXPLAIN/plan, check indexes, data volume, caching.",
    ),
    _q(
        51,
        "SCENARIO",
        "Interview overlay TTFT is 3s; product goal is <800ms. List 4 concrete latency cuts.",
        keywords=("model", "stream", "cache", "prompt", "region", "token", "ttft"),
        expected="Faster model, shorter prompts, streaming, regional routing, caching.",
    ),
    _q(
        52,
        "SCENARIO",
        "Two teammates edit the same Git feature branch and conflict on merge. Outline a safe fix.",
        keywords=("pull", "merge", "rebase", "conflict", "commit", "test"),
        expected="Fetch, merge/rebase, resolve conflicts, test, push carefully.",
    ),
    # ========== 9. REAL-TIME INTERVIEW / CueAI short (8) ==========
    _q(
        53,
        "REALTIME_INTERVIEW",
        "What is polymorphism?",
        keywords=("polymorphism", "same", "different", "form", "method"),
        expected="Same interface, different behavior.",
    ),
    _q(
        54,
        "REALTIME_INTERVIEW",
        "What is REST API?",
        keywords=("rest", "api", "http", "resource"),
        expected="HTTP-oriented API style for resources.",
    ),
    _q(
        55,
        "REALTIME_INTERVIEW",
        "Explain inheritance.",
        keywords=("inherit", "parent", "child", "reuse"),
        expected="Child class reuses parent behavior.",
    ),
    _q(
        56,
        "REALTIME_INTERVIEW",
        "What is SQL normalization?",
        keywords=("normal", "redundant", "database"),
        expected="Reduce redundancy via structured tables.",
    ),
    _q(
        57,
        "REALTIME_INTERVIEW",
        "What is an API?",
        keywords=("api", "interface", "application", "communicate"),
        expected="Interface for software components to communicate.",
    ),
    _q(
        58,
        "REALTIME_INTERVIEW",
        "What is a database index?",
        keywords=("index", "lookup", "speed", "query"),
        expected="Structure that speeds lookups.",
    ),
    _q(
        59,
        "REALTIME_INTERVIEW",
        "What is recursion?",
        keywords=("recursion", "itself", "base", "call"),
        expected="Function calls itself with a base case.",
    ),
    _q(
        60,
        "REALTIME_INTERVIEW",
        "What is binary search?",
        keywords=("binary", "search", "sorted", "log", "half"),
        expected="Search sorted data by repeatedly halving; O(log n).",
    ),
    # ========== 10. BEHAVIORAL / HR (5) ==========
    _q(
        61,
        "BEHAVIORAL_HR",
        'An interviewer asks: "Tell me about yourself." Give a concise 45-second professional answer '
        "for a software/AI engineer.",
        keywords=("experience", "project", "skill", "role", "software", "engineer"),
        expected="Brief background, skills, relevant project, role interest.",
        eval_type="behavioral",
    ),
    _q(
        62,
        "BEHAVIORAL_HR",
        'Answer: "Tell me about a project you built using Python." Keep it professional and concise.',
        keywords=("python", "project", "built", "challenge", "result"),
        expected="STAR-style Python project story.",
        eval_type="behavioral",
    ),
    _q(
        63,
        "BEHAVIORAL_HR",
        "Describe a time you resolved a conflict on a team. Use STAR briefly.",
        keywords=("situation", "task", "action", "result", "conflict", "team"),
        expected="STAR conflict-resolution story.",
        eval_type="behavioral",
    ),
    _q(
        64,
        "BEHAVIORAL_HR",
        "Why should we hire you for an AI/product engineering role? 4 short bullets.",
        keywords=("skill", "impact", "learn", "team", "ai", "product"),
        expected="Skills, impact, learning speed, collaboration.",
        eval_type="behavioral",
    ),
    _q(
        65,
        "BEHAVIORAL_HR",
        "Where do you see yourself in 3 years? Keep it realistic and role-aligned.",
        keywords=("grow", "engineer", "lead", "skill", "impact"),
        expected="Growth in engineering depth/ownership aligned to company.",
        eval_type="behavioral",
    ),
    # ========== 11. SHORT ANSWER (5) ==========
    _q(
        66,
        "SHORT_ANSWER",
        "In one sentence: what is TTFT?",
        keywords=("first", "token", "time", "latency"),
        expected="Time until the first streamed token arrives.",
        eval_type="factual",
    ),
    _q(
        67,
        "SHORT_ANSWER",
        "In one sentence: what is RAG?",
        keywords=("retrieval", "augment", "generation"),
        expected="Retrieval-Augmented Generation grounds answers with retrieved docs.",
        eval_type="factual",
    ),
    _q(
        68,
        "SHORT_ANSWER",
        "In one sentence: what is Git?",
        keywords=("git", "version", "control"),
        expected="Distributed version control system.",
        eval_type="factual",
    ),
    _q(
        69,
        "SHORT_ANSWER",
        "In one sentence: GET vs POST?",
        keywords=("get", "post", "retrieve", "create", "body"),
        expected="GET retrieves; POST submits/creates (often with body).",
        eval_type="factual",
    ),
    _q(
        70,
        "SHORT_ANSWER",
        "In one sentence: what is a mutex?",
        keywords=("mutex", "lock", "mutual", "exclusion", "thread"),
        expected="Lock ensuring mutual exclusion for shared resource access.",
        eval_type="factual",
    ),
    # ========== 12. FOLLOW-UP QUESTIONS (5) ==========
    _q(
        71,
        "FOLLOW_UP",
        "You just said REST is stateless. Follow-up: how do apps keep user login state with REST?",
        keywords=("token", "jwt", "session", "cookie", "auth", "header"),
        expected="Client sends auth tokens/cookies; server validates without storing session if JWT.",
    ),
    _q(
        72,
        "FOLLOW_UP",
        "You mentioned indexes speed reads. Follow-up: when can an index hurt performance?",
        keywords=("write", "insert", "update", "storage", "overhead", "maintain"),
        expected="Extra write/storage cost; poor selectivity can hurt.",
    ),
    _q(
        73,
        "FOLLOW_UP",
        "You said binary search is O(log n). Follow-up: what precondition makes that true?",
        keywords=("sorted", "order", "random access"),
        expected="Data must be sorted (and random-access for arrays).",
        eval_type="factual",
    ),
    _q(
        74,
        "FOLLOW_UP",
        "You explained Docker containers. Follow-up: how is a container different from a VM?",
        keywords=("kernel", "hypervisor", "os", "lightweight", "share"),
        expected="Containers share host kernel; VMs virtualize hardware/OS.",
    ),
    _q(
        75,
        "FOLLOW_UP",
        "You described polymorphism. Follow-up: how does it differ from inheritance?",
        keywords=("polymorphism", "inherit", "behavior", "reuse", "interface"),
        expected="Inheritance reuses structure; polymorphism varies behavior via shared interface.",
    ),
    # Extra coverage (same shared order for every model)
    _q(
        76,
        "LOGICAL_REASONING",
        "A, B and C sit in a single row. B is in the middle. A is not at the right end. "
        "Who sits at the right end? One word.",
        keywords=("c",),
        expected="C",
        eval_type="logical",
        accepted=("c", "person c", "c sits"),
    ),
    _q(
        77,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\ndef append_item(item, bucket=[]):\n"
        "    bucket.append(item)\n"
        "    return bucket\n"
        "print(append_item(1))\n"
        "print(append_item(2))\n"
        "```\n"
        "Explain the unexpected output and give a correct default.",
        keywords=("mutable", "default", "none", "list"),
        expected="Mutable default list is shared. Use bucket=None then bucket = bucket or [].",
        eval_type="debugging",
        coding_checks=("mutable", "none", "default"),
    ),
    _q(
        78,
        "APTITUDE",
        "Simple interest on Rs.2000 at 10% per year for 2 years is how many rupees? Number only.",
        keywords=("400",),
        expected="400",
        eval_type="aptitude",
        accepted=("400", "rs 400", "rs.400"),
    ),
    _q(
        79,
        "SQL_DATABASE",
        "Write SQL to count employees per department from employees(dept, name).",
        keywords=("select", "count", "group by", "dept"),
        expected="SELECT dept, COUNT(*) FROM employees GROUP BY dept;",
        eval_type="sql",
        coding_checks=("select", "group by", "count"),
    ),
    _q(
        80,
        "TECHNICAL",
        "What is the CAP theorem in distributed systems?",
        keywords=("consistency", "availability", "partition", "cap"),
        expected="A distributed system can fully guarantee only two of Consistency, Availability, Partition tolerance.",
    ),
]


REQUIRED_CATEGORIES = (
    "TECHNICAL",
    "APTITUDE",
    "LOGICAL_REASONING",
    "CODING",
    "DEBUGGING",
    "SQL_DATABASE",
    "COMPUTER_SCIENCE",
    "SCENARIO",
    "REALTIME_INTERVIEW",
    "BEHAVIORAL_HR",
    "SHORT_ANSWER",
    "FOLLOW_UP",
)


# CueAI realtime subset (short questions) — same order subset for --cueai
CUEAI_REALTIME_PROMPTS: list[PromptCase] = [
    p for p in PROMPTS if p.category == "REALTIME_INTERVIEW"
]


def select_prompts(*, cueai_only: bool = False, quick: bool = False) -> list[PromptCase]:
    prompts = list(CUEAI_REALTIME_PROMPTS) if cueai_only else list(PROMPTS)
    if quick:
        return prompts[:1]
    return prompts


def category_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for p in PROMPTS:
        counts[p.category] = counts.get(p.category, 0) + 1
    return counts


def validate_question_bank(min_total: int = 60, min_per_category: int = 5) -> None:
    """Fail fast if the shared bank is too small or reordered IDs collide."""
    counts = category_counts()
    missing = [c for c in REQUIRED_CATEGORIES if counts.get(c, 0) < min_per_category]
    if missing:
        raise ValueError(
            "Question bank is short in: "
            + ", ".join(f"{c}={counts.get(c, 0)}" for c in missing)
        )
    if len(PROMPTS) < min_total:
        raise ValueError(f"Need at least {min_total} questions, found {len(PROMPTS)}")
    ids = [p.id for p in PROMPTS]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate question IDs in PROMPTS")
    for p in PROMPTS:
        if p.eval_type in {"aptitude", "logical"} and not (
            p.expected_answer or p.accepted_answers
        ):
            raise ValueError(f"{p.id} ({p.category}) needs a verified expected answer")
