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
    "scenario",
    "follow_up",
]

Difficulty = Literal["EASY", "MEDIUM", "HARD"]


@dataclass(frozen=True)
class PromptCase:
    id: str
    category: str
    text: str
    expected_keywords: tuple[str, ...] = ()
    expected_answer: str = ""
    eval_type: EvalType = "conceptual"
    coding_checks: tuple[str, ...] = ()
    accepted_answers: tuple[str, ...] = ()
    difficulty: Difficulty = "MEDIUM"
    history: tuple[tuple[str, str], ...] = ()
    word_limit: int = 0
    bullet_count: int = 0


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
    difficulty: Difficulty = "MEDIUM",
    history: tuple[tuple[str, str], ...] = (),
    word_limit: int = 0,
    bullet_count: int = 0,
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
        difficulty=difficulty,
        history=history,
        word_limit=word_limit,
        bullet_count=bullet_count,
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
        difficulty="EASY",
    ),
    _q(
        2,
        "TECHNICAL",
        "Explain the difference between HTTP and HTTPS.",
        keywords=("http", "https", "tls", "ssl", "encrypt", "secure"),
        expected="HTTPS is HTTP secured with TLS/SSL encryption.",
        eval_type="factual",
        difficulty="EASY",
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
        difficulty="HARD",
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
        difficulty="EASY",
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
        eval_type="scenario",
    ),
    _q(
        49,
        "SCENARIO",
        "Your REST API returns 429 often during demos. Give 4 practical mitigations.",
        keywords=("rate", "retry", "backoff", "cache", "limit", "queue"),
        expected="Backoff retries, caching, request coalescing, higher limits, queueing.",
        eval_type="scenario",
    ),
    _q(
        50,
        "SCENARIO",
        "A production DB query is slow only for one report. How do you diagnose in 5 steps?",
        keywords=("explain", "index", "slow", "query", "profile", "plan"),
        expected="Capture query, EXPLAIN/plan, check indexes, data volume, caching.",
        eval_type="scenario",
    ),
    _q(
        51,
        "SCENARIO",
        "Interview overlay TTFT is 3s; product goal is <800ms. List 4 concrete latency cuts.",
        keywords=("model", "stream", "cache", "prompt", "region", "token", "ttft"),
        expected="Faster model, shorter prompts, streaming, regional routing, caching.",
        eval_type="scenario",
    ),
    _q(
        52,
        "SCENARIO",
        "Two teammates edit the same Git feature branch and conflict on merge. Outline a safe fix.",
        keywords=("pull", "merge", "rebase", "conflict", "commit", "test"),
        expected="Fetch, merge/rebase, resolve conflicts, test, push carefully.",
        eval_type="scenario",
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
    # ========== 12. FOLLOW-UP QUESTIONS (multi-turn, identical context) ==========
    _q(
        71,
        "FOLLOW_UP",
        "What is REST API?",
        keywords=("rest", "api", "http", "resource"),
        expected="REST is an HTTP-style API design for resources.",
        eval_type="follow_up",
        difficulty="EASY",
    ),
    _q(
        72,
        "FOLLOW_UP",
        "Explain it with a concrete example.",
        keywords=("example", "get", "post", "resource", "http"),
        expected="Example: GET /users/42 retrieves a user resource over HTTP.",
        eval_type="follow_up",
        difficulty="MEDIUM",
        history=(
            ("user", "What is REST API?"),
            ("assistant", "REST is an HTTP-style API design for resources."),
        ),
    ),
    _q(
        73,
        "FOLLOW_UP",
        "How is REST different from SOAP?",
        keywords=("soap", "xml", "http", "lightweight", "protocol"),
        expected="SOAP is a stricter XML protocol; REST is a lighter HTTP resource style.",
        eval_type="follow_up",
        difficulty="MEDIUM",
        history=(
            ("user", "What is REST API?"),
            ("assistant", "REST is an HTTP-style API design for resources."),
            ("user", "Explain it with a concrete example."),
            ("assistant", "Example: GET /users/42 retrieves a user resource over HTTP."),
        ),
    ),
    _q(
        74,
        "FOLLOW_UP",
        "When would you choose REST over SOAP?",
        keywords=("web", "json", "mobile", "public", "simple"),
        expected="Prefer REST for public/web/mobile JSON APIs; SOAP when formal contracts/WS-* are required.",
        eval_type="follow_up",
        difficulty="HARD",
        history=(
            ("user", "What is REST API?"),
            ("assistant", "REST is an HTTP-style API design for resources."),
            ("user", "Explain it with a concrete example."),
            ("assistant", "Example: GET /users/42 retrieves a user resource over HTTP."),
            ("user", "How is REST different from SOAP?"),
            ("assistant", "SOAP is a stricter XML protocol; REST is a lighter HTTP resource style."),
        ),
    ),
    _q(
        75,
        "FOLLOW_UP",
        "What is polymorphism?",
        keywords=("polymorphism", "same", "interface", "behavior"),
        expected="Same interface, different implementations.",
        eval_type="follow_up",
        difficulty="EASY",
    ),
    _q(
        76,
        "FOLLOW_UP",
        "Give a short Python example of polymorphism.",
        keywords=("class", "def", "override", "python"),
        expected="Two subclasses implement the same method differently.",
        eval_type="follow_up",
        difficulty="MEDIUM",
        history=(
            ("user", "What is polymorphism?"),
            ("assistant", "Same interface, different implementations."),
        ),
    ),
    # Extra TECHNICAL
    _q(
        77,
        "TECHNICAL",
        "What is RAG in one short paragraph?",
        keywords=("retrieval", "augment", "generation", "document"),
        expected="Retrieval-Augmented Generation grounds an LLM with retrieved documents.",
        eval_type="factual",
        difficulty="MEDIUM",
    ),
    _q(
        78,
        "TECHNICAL",
        "What is an API gateway?",
        keywords=("gateway", "route", "auth", "rate", "api"),
        expected="A front door that routes, authenticates, and rate-limits API traffic.",
        difficulty="MEDIUM",
    ),
    _q(
        79,
        "TECHNICAL",
        "What is caching and when should you use it?",
        keywords=("cache", "latency", "ttl", "stale", "memory"),
        expected="Store expensive results to cut latency; watch TTL and invalidation.",
        difficulty="MEDIUM",
    ),
    _q(
        80,
        "TECHNICAL",
        "Explain authentication vs authorization.",
        keywords=("identity", "permission", "authn", "authz", "who", "what"),
        expected="Authentication verifies identity; authorization checks permissions.",
        difficulty="EASY",
    ),
    _q(
        81,
        "TECHNICAL",
        "What is load balancing?",
        keywords=("load", "balance", "traffic", "instance", "scale"),
        expected="Distribute traffic across instances for scale and availability.",
        difficulty="MEDIUM",
    ),
    # Extra CODING
    _q(
        82,
        "CODING",
        "Write Python to merge two sorted lists into one sorted list. State Big-O.",
        keywords=("def", "merge", "sorted", "o(n"),
        expected="Two-pointer merge; O(n+m).",
        eval_type="coding",
        coding_checks=("def", "return"),
        difficulty="MEDIUM",
    ),
    _q(
        83,
        "CODING",
        "Write Python to find the first non-repeating character in a string, or return None.",
        keywords=("def", "count", "first", "return"),
        expected="Count frequencies then scan in order.",
        eval_type="coding",
        coding_checks=("def", "return"),
        difficulty="MEDIUM",
    ),
    # Extra DEBUGGING
    _q(
        84,
        "DEBUGGING",
        "Find the SQL bug:\nSELECT dept, COUNT(*) FROM employees WHERE COUNT(*) > 5 GROUP BY dept;\n"
        "Explain and give corrected SQL.",
        keywords=("having", "where", "group", "count"),
        expected="Aggregate filters use HAVING, not WHERE.",
        eval_type="debugging",
        coding_checks=("having", "group"),
        difficulty="MEDIUM",
    ),
    _q(
        85,
        "DEBUGGING",
        "API bug: a handler returns 200 with an empty body when the user is missing. "
        "What status should it use and why?",
        keywords=("404", "not found", "status"),
        expected="Use 404 (or 401 if unauthorized), not 200 with empty body.",
        eval_type="debugging",
        coding_checks=("404", "status"),
        difficulty="MEDIUM",
    ),
    _q(
        86,
        "DEBUGGING",
        "Find the async bug:\n"
        "```python\nimport asyncio\nasync def load():\n    return 1\nprint(load())\n```\n"
        "Explain and fix.",
        keywords=("await", "asyncio", "coroutine", "run"),
        expected="Must await or asyncio.run the coroutine; print(load()) prints a coroutine object.",
        eval_type="debugging",
        coding_checks=("await", "asyncio"),
        difficulty="HARD",
    ),
    _q(
        87,
        "DEBUGGING",
        "Data-processing bug: pandas `df['x'] = df['x'] / df['x'].mean()` is run twice in a pipeline. "
        "What happens to the values? How do you make it idempotent?",
        keywords=("idempotent", "normalize", "twice", "mean"),
        expected="Second pass renormalizes already scaled data. Compute mean once or skip if already scaled.",
        eval_type="debugging",
        difficulty="HARD",
    ),
    # Extra SQL
    _q(
        88,
        "SQL_DATABASE",
        "Write SQL to find duplicate emails in users(email).",
        keywords=("select", "email", "group by", "having", "count"),
        expected="GROUP BY email HAVING COUNT(*) > 1.",
        eval_type="sql",
        coding_checks=("group by", "having"),
        difficulty="MEDIUM",
    ),
    _q(
        89,
        "SQL_DATABASE",
        "Explain INNER JOIN vs LEFT JOIN in two bullets.",
        keywords=("inner", "left", "match", "null"),
        expected="INNER keeps matches only; LEFT keeps all left rows.",
        bullet_count=2,
        difficulty="EASY",
    ),
    _q(
        90,
        "SQL_DATABASE",
        "When do you use WHERE vs HAVING?",
        keywords=("where", "having", "group", "aggregate"),
        expected="WHERE filters rows before grouping; HAVING filters after aggregates.",
        difficulty="MEDIUM",
    ),
    # Extra CS
    _q(
        91,
        "COMPUTER_SCIENCE",
        "What is a deadlock? Give one prevention idea.",
        keywords=("deadlock", "lock", "wait", "cycle"),
        expected="Circular wait on locks; prevent with lock ordering or timeouts.",
        difficulty="MEDIUM",
    ),
    _q(
        92,
        "COMPUTER_SCIENCE",
        "What is a hash table and its average lookup complexity?",
        keywords=("hash", "o(1)", "bucket", "key"),
        expected="Key-to-bucket map; average O(1) lookup.",
        eval_type="factual",
        accepted=("o(1)", "constant"),
        difficulty="EASY",
    ),
    _q(
        93,
        "COMPUTER_SCIENCE",
        "What is a binary tree vs a binary search tree?",
        keywords=("binary", "tree", "search", "left", "right"),
        expected="BST orders left < node < right; a binary tree has no ordering requirement.",
        difficulty="MEDIUM",
    ),
    # Extra SCENARIO
    _q(
        94,
        "SCENARIO",
        "Production API latency jumps after a deploy. List 5 investigation steps.",
        keywords=("deploy", "metric", "trace", "log", "rollback", "profile"),
        expected="Compare deploy diff, metrics/traces, slow endpoints, DB, rollback plan.",
        eval_type="scenario",
        difficulty="HARD",
    ),
    _q(
        95,
        "SCENARIO",
        "The app works locally but fails in production. How do you debug? 5 checks.",
        keywords=("env", "config", "secret", "network", "permission", "log"),
        expected="Compare env/config/secrets, network, permissions, versions, production logs.",
        eval_type="scenario",
        difficulty="MEDIUM",
    ),
    _q(
        96,
        "SCENARIO",
        "Two users get different results from the same feature. How do you investigate?",
        keywords=("repro", "account", "cache", "flag", "data", "permission"),
        expected="Reproduce both accounts; check flags, cache, data, permissions, race.",
        eval_type="scenario",
        difficulty="MEDIUM",
    ),
    _q(
        97,
        "SCENARIO",
        "A query takes 10s instead of 100ms. What do you check first?",
        keywords=("explain", "index", "lock", "plan", "volume"),
        expected="EXPLAIN/plan, missing index, locks, data volume, connection pool.",
        eval_type="scenario",
        difficulty="MEDIUM",
    ),
    _q(
        98,
        "SCENARIO",
        "The app crashes intermittently. What do you investigate first?",
        keywords=("log", "core", "memory", "timeout", "health"),
        expected="Crash logs/core dumps, memory, timeouts, health checks, last deploy.",
        eval_type="scenario",
        difficulty="MEDIUM",
    ),
    # Extra REALTIME
    _q(
        99,
        "REALTIME_INTERVIEW",
        "What is HTTP?",
        keywords=("http", "protocol", "request", "web"),
        expected="Hypertext Transfer Protocol for web requests.",
        difficulty="EASY",
    ),
    _q(
        100,
        "REALTIME_INTERVIEW",
        "What is Python?",
        keywords=("python", "language", "interpret"),
        expected="A high-level interpreted programming language.",
        difficulty="EASY",
    ),
    _q(
        101,
        "REALTIME_INTERVIEW",
        "What is OOP?",
        keywords=("object", "class", "encapsul", "inherit"),
        expected="Object-oriented programming: classes, objects, encapsulation.",
        difficulty="EASY",
    ),
    _q(
        102,
        "REALTIME_INTERVIEW",
        "What is RAG?",
        keywords=("retrieval", "augment", "generation"),
        expected="Retrieval-Augmented Generation.",
        difficulty="EASY",
    ),
    # Extra SHORT ANSWER with constraints
    _q(
        103,
        "SHORT_ANSWER",
        "Explain REST API in at most 30 words.",
        keywords=("rest", "http", "api"),
        expected="REST is an HTTP resource API style.",
        eval_type="factual",
        word_limit=30,
        difficulty="EASY",
    ),
    _q(
        104,
        "SHORT_ANSWER",
        "Explain polymorphism in at most 50 words.",
        keywords=("polymorphism", "interface", "behavior"),
        expected="Same interface, different behavior.",
        word_limit=50,
        difficulty="EASY",
    ),
    _q(
        105,
        "SHORT_ANSWER",
        "List exactly three bullet points: benefits of database indexes.",
        keywords=("index", "lookup", "query"),
        expected="Faster lookups; better filters/sorts; write/storage tradeoff.",
        bullet_count=3,
        difficulty="MEDIUM",
    ),
    # Extra APTITUDE — verified (percentage, SI/CI, time/work, mixture, LCM, ratio)
    _q(
        106,
        "APTITUDE",
        "Simple interest on Rs.1000 at 10% per annum for 2 years? Number only (rupees).",
        keywords=("200",),
        expected="200",
        eval_type="aptitude",
        accepted=("200", "rs 200", "rs.200"),
        difficulty="EASY",
    ),
    _q(
        107,
        "APTITUDE",
        "Compound interest on Rs.1000 at 10% per annum for 2 years, compounded annually? Number only.",
        keywords=("210", "1210"),
        expected="210",
        eval_type="aptitude",
        accepted=("210", "1210", "rs 210", "rs 1210"),
        difficulty="MEDIUM",
    ),
    _q(
        108,
        "APTITUDE",
        "15 people finish a job in 20 days. How many days will 10 people take, same rate? Number only.",
        keywords=("30",),
        expected="30",
        eval_type="aptitude",
        accepted=("30", "30 days"),
        difficulty="MEDIUM",
    ),
    _q(
        109,
        "APTITUDE",
        "A 20 L mixture is milk:water = 3:2. How many litres of milk? Number only.",
        keywords=("12",),
        expected="12",
        eval_type="aptitude",
        accepted=("12", "12 l", "12 litres", "12 liters"),
        difficulty="EASY",
    ),
    _q(
        110,
        "APTITUDE",
        "Two fair coins are tossed. Probability both are heads? Simplified fraction.",
        keywords=("1/4", "0.25"),
        expected="1/4",
        eval_type="aptitude",
        accepted=("1/4", "0.25", "25%"),
        difficulty="EASY",
    ),
    _q(
        111,
        "APTITUDE",
        "Find the next number: 1, 4, 9, 16, 25, ?",
        keywords=("36",),
        expected="36",
        eval_type="aptitude",
        accepted=("36",),
        difficulty="EASY",
    ),
    _q(
        112,
        "APTITUDE",
        "LCM of 12 and 18? Number only.",
        keywords=("36",),
        expected="36",
        eval_type="aptitude",
        accepted=("36",),
        difficulty="EASY",
    ),
    _q(
        113,
        "APTITUDE",
        "If 5:7 = x:21, what is x? Number only.",
        keywords=("15",),
        expected="15",
        eval_type="aptitude",
        accepted=("15",),
        difficulty="EASY",
    ),
    _q(
        114,
        "APTITUDE",
        "A boat speed in still water is 10 km/h; current is 2 km/h. Downstream speed in km/h? Number only.",
        keywords=("12",),
        expected="12",
        eval_type="aptitude",
        accepted=("12", "12 km/h"),
        difficulty="EASY",
    ),
    _q(
        115,
        "APTITUDE",
        "What is 40% of 250? Number only.",
        keywords=("100",),
        expected="100",
        eval_type="aptitude",
        accepted=("100",),
        difficulty="EASY",
    ),
    # Extra LOGICAL — seating, odd-one-out, syllogism, distance
    _q(
        116,
        "LOGICAL_REASONING",
        "Five people A, B, C, D, E sit in a row facing north. A is at the left end. "
        "B sits immediately right of A. C is at the right end. D sits immediately left of C. "
        "Who sits in the middle? Reply with the letter.",
        keywords=("e",),
        expected="E",
        eval_type="logical",
        accepted=("e", "person e"),
        difficulty="MEDIUM",
    ),
    _q(
        117,
        "LOGICAL_REASONING",
        "Four friends sit in a line facing north. P is left of Q. R is right of Q. S is left of P. "
        "Who is at the extreme left? One letter.",
        keywords=("s",),
        expected="S",
        eval_type="logical",
        accepted=("s", "person s"),
        difficulty="MEDIUM",
    ),
    _q(
        118,
        "LOGICAL_REASONING",
        "A man walks 5 km north, then 5 km east, then 5 km south. How far is he from the start, in km?",
        keywords=("5",),
        expected="5",
        eval_type="logical",
        accepted=("5", "5 km", "5km"),
        difficulty="EASY",
    ),
    _q(
        119,
        "LOGICAL_REASONING",
        "Odd one out: 2, 3, 5, 7, 9. Reply with the number and one reason.",
        keywords=("9", "prime", "odd", "composite"),
        expected="9 — not prime (or not in the prime sequence).",
        eval_type="logical",
        accepted=("9",),
        difficulty="EASY",
    ),
    _q(
        120,
        "LOGICAL_REASONING",
        "All roses are flowers. Some flowers fade quickly. Therefore all roses fade quickly. "
        "Does this follow? YES or NO with one reason.",
        keywords=("no",),
        expected="NO — some flowers fading does not imply all roses fade.",
        eval_type="logical",
        accepted=("no",),
        difficulty="MEDIUM",
    ),
    _q(
        121,
        "LOGICAL_REASONING",
        "If Monday is coded as 123456, how many letters does MONDAY have? Number only.",
        keywords=("6",),
        expected="6",
        eval_type="logical",
        accepted=("6",),
        difficulty="EASY",
    ),
    # Extra CODING
    _q(
        122,
        "CODING",
        "Write Python factorial(n) for n >= 0. Handle n=0. State Big-O.",
        keywords=("def", "factorial", "return", "0"),
        expected="Iterative or recursive factorial; 0! = 1; typically O(n).",
        eval_type="coding",
        coding_checks=("def", "return"),
        difficulty="EASY",
    ),
    _q(
        123,
        "CODING",
        "Write Python two_sum(nums, target) returning indices of two numbers that add to target, or None.",
        keywords=("def", "target", "return", "dict", "map"),
        expected="Hash map of complements; average O(n).",
        eval_type="coding",
        coding_checks=("def", "return"),
        difficulty="MEDIUM",
    ),
    _q(
        124,
        "CODING",
        "Write Python is_valid_parentheses(s) for '()[]{}'. Mention edge cases (empty string).",
        keywords=("def", "stack", "return", "empty"),
        expected="Stack matching; empty string is valid.",
        eval_type="coding",
        coding_checks=("def", "return", "stack"),
        difficulty="MEDIUM",
    ),
    _q(
        125,
        "CODING",
        "Write Python fibonacci(n) returning the n-th Fibonacci number (0-indexed). State Big-O.",
        keywords=("def", "fib", "return", "o("),
        expected="Iterative O(n) preferred over naive recursion.",
        eval_type="coding",
        coding_checks=("def", "return"),
        difficulty="EASY",
    ),
    # Extra DEBUGGING — broken code CueAI would see in interviews
    _q(
        126,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\ndef append_item(x, items=[]):\n    items.append(x)\n    return items\n"
        "print(append_item(1))\nprint(append_item(2))\n```\n"
        "Explain why the second call is surprising and give a correct default.",
        keywords=("default", "mutable", "none", "list"),
        expected="Mutable default list is shared; use items=None then items = items or [].",
        eval_type="debugging",
        coding_checks=("mutable", "default", "none"),
        difficulty="HARD",
    ),
    _q(
        127,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\nn = 1\nif n = 1:\n    print('one')\n```\n"
        "Explain and fix.",
        keywords=("syntax", "=", "==", "assign"),
        expected="Assignment in if is a SyntaxError; use ==.",
        eval_type="debugging",
        coding_checks=("==", "syntax"),
        difficulty="EASY",
    ),
    _q(
        128,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\nvals = [1, 2, 3, 2]\nfor v in vals:\n    if v == 2:\n        vals.remove(v)\nprint(vals)\n```\n"
        "Explain and give a safe rewrite.",
        keywords=("remove", "iterate", "copy", "skip"),
        expected="Mutating a list while iterating skips elements. Iterate a copy or build a new list.",
        eval_type="debugging",
        coding_checks=("remove", "iterate"),
        difficulty="MEDIUM",
    ),
    _q(
        129,
        "DEBUGGING",
        "Find the bug:\n"
        "```python\na = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)\n```\n"
        "Why does `a` change? How do you copy?",
        keywords=("reference", "copy", "alias", "append"),
        expected="b aliases a; use a.copy() or list(a) for a shallow copy.",
        eval_type="debugging",
        coding_checks=("copy", "reference"),
        difficulty="EASY",
    ),
    # Extra SQL
    _q(
        130,
        "SQL_DATABASE",
        "What is the difference between DELETE, TRUNCATE, and DROP? 3 short bullets.",
        keywords=("delete", "truncate", "drop", "table", "row"),
        expected="DELETE removes rows; TRUNCATE empties the table; DROP removes the table.",
        bullet_count=3,
        difficulty="MEDIUM",
    ),
    _q(
        131,
        "SQL_DATABASE",
        "Write SQL to list departments and employee counts, only departments with more than 5 employees. "
        "Tables: employees(dept, id).",
        keywords=("group by", "having", "count", "dept"),
        expected="GROUP BY dept HAVING COUNT(*) > 5.",
        eval_type="sql",
        coding_checks=("group by", "having"),
        difficulty="MEDIUM",
    ),
    _q(
        132,
        "SQL_DATABASE",
        "What does NULL mean in SQL vs an empty string? One short paragraph.",
        keywords=("null", "unknown", "empty", "string"),
        expected="NULL is unknown/missing; empty string is a known zero-length value.",
        difficulty="EASY",
    ),
    _q(
        133,
        "SQL_DATABASE",
        "Write a LEFT JOIN: employees(id, dept_id) and departments(id, name) returning employee id and dept name "
        "(include employees with no department).",
        keywords=("left join", "select", "on"),
        expected="SELECT e.id, d.name FROM employees e LEFT JOIN departments d ON e.dept_id = d.id;",
        eval_type="sql",
        coding_checks=("left join", "select"),
        difficulty="MEDIUM",
    ),
    # Extra CS
    _q(
        134,
        "COMPUTER_SCIENCE",
        "Name the 7 OSI layers in order (bottom to top or top to bottom).",
        keywords=("physical", "data link", "network", "transport", "session", "presentation", "application"),
        expected="Physical, Data Link, Network, Transport, Session, Presentation, Application.",
        eval_type="factual",
        difficulty="MEDIUM",
    ),
    _q(
        135,
        "COMPUTER_SCIENCE",
        "Mutex vs semaphore in 3 bullets.",
        keywords=("mutex", "semaphore", "lock", "count"),
        expected="Mutex is a binary lock/ownership; semaphore is a counter for signaling.",
        bullet_count=3,
        difficulty="MEDIUM",
    ),
    _q(
        136,
        "COMPUTER_SCIENCE",
        "What is virtual memory?",
        keywords=("virtual", "memory", "page", "disk", "address"),
        expected="OS maps virtual addresses to RAM/disk so processes get a large address space.",
        difficulty="MEDIUM",
    ),
    _q(
        137,
        "COMPUTER_SCIENCE",
        "DFS vs BFS: one difference and one typical use each.",
        keywords=("dfs", "bfs", "stack", "queue", "depth", "breadth"),
        expected="DFS goes deep (stack); BFS level-order (queue). DFS: path/cycle; BFS: shortest unweighted path.",
        difficulty="MEDIUM",
    ),
    _q(
        138,
        "COMPUTER_SCIENCE",
        "What is garbage collection?",
        keywords=("garbage", "memory", "unreach", "collect", "free"),
        expected="Automatic reclaim of memory that is no longer reachable.",
        difficulty="EASY",
    ),
    # Extra TECHNICAL HARD
    _q(
        139,
        "TECHNICAL",
        "Explain the CAP theorem in 3 bullets.",
        keywords=("consistency", "availability", "partition", "cap"),
        expected="A distributed system can fully guarantee only two of Consistency, Availability, Partition tolerance.",
        difficulty="HARD",
    ),
    _q(
        140,
        "TECHNICAL",
        "What is a race condition? Give one prevention.",
        keywords=("race", "concurrent", "lock", "atomic"),
        expected="Concurrent access with timing-dependent results; prevent with locks/atomics.",
        difficulty="HARD",
    ),
    _q(
        141,
        "TECHNICAL",
        "SQL vs NoSQL: when would you pick each? 4 short bullets.",
        keywords=("sql", "nosql", "schema", "scale", "join"),
        expected="SQL for relational/joins/ACID; NoSQL for flexible schema and horizontal scale.",
        difficulty="MEDIUM",
    ),
    _q(
        142,
        "TECHNICAL",
        "What is CI/CD in one short paragraph?",
        keywords=("continuous", "integrat", "deploy", "pipeline"),
        expected="Automated build/test (CI) and delivery/deploy (CD) pipelines.",
        eval_type="factual",
        difficulty="EASY",
    ),
    _q(
        143,
        "TECHNICAL",
        "What is a microservice? One risk of too many services.",
        keywords=("microservice", "independent", "deploy", "network", "complexity"),
        expected="Independently deployable services; risk is operational/network complexity.",
        difficulty="MEDIUM",
    ),
    # Extra SCENARIO
    _q(
        144,
        "SCENARIO",
        "Production API returns 5xx for 8% of requests after a deploy. List 5 investigation steps.",
        keywords=("rollback", "log", "error", "deploy", "metric", "trace"),
        expected="Check error budget/metrics, logs/traces, deploy diff, dependent services, rollback.",
        eval_type="scenario",
        difficulty="HARD",
    ),
    _q(
        145,
        "SCENARIO",
        "Unit tests are flaky only in CI. Give 4 likely causes.",
        keywords=("time", "order", "race", "network", "seed", "isolation"),
        expected="Time/order dependence, shared state, races, network, unseeded randomness.",
        eval_type="scenario",
        difficulty="MEDIUM",
    ),
    _q(
        146,
        "SCENARIO",
        "You are paged at 3am: checkout is down. What do you do in the first 10 minutes? 5 steps.",
        keywords=("ack", "status", "log", "mitigate", "communicate", "rollback"),
        expected="Ack page, check status/errors, mitigate (rollback/feature flag), communicate, capture evidence.",
        eval_type="scenario",
        difficulty="HARD",
    ),
    # Extra REALTIME interview (CueAI overlay style)
    _q(
        147,
        "REALTIME_INTERVIEW",
        "What is JSON?",
        keywords=("json", "javascript", "object", "notation"),
        expected="JavaScript Object Notation — a text data format.",
        difficulty="EASY",
    ),
    _q(
        148,
        "REALTIME_INTERVIEW",
        "What is Git?",
        keywords=("git", "version", "control"),
        expected="Distributed version control.",
        difficulty="EASY",
    ),
    _q(
        149,
        "REALTIME_INTERVIEW",
        "What is a deadlock?",
        keywords=("deadlock", "lock", "wait", "cycle"),
        expected="Circular wait on locks so no one can proceed.",
        difficulty="MEDIUM",
    ),
    _q(
        150,
        "REALTIME_INTERVIEW",
        "What is TTFT?",
        keywords=("first", "token", "time"),
        expected="Time to first token in a streamed response.",
        difficulty="EASY",
    ),
    _q(
        151,
        "REALTIME_INTERVIEW",
        "What is Docker?",
        keywords=("docker", "container"),
        expected="Tool to package and run apps in containers.",
        difficulty="EASY",
    ),
    # Extra BEHAVIORAL
    _q(
        152,
        "BEHAVIORAL_HR",
        "What is your greatest professional weakness, and how are you improving it? Keep it honest and concise.",
        keywords=("weak", "improv", "learn", "example"),
        expected="A real weakness plus a concrete improvement habit.",
        eval_type="behavioral",
        difficulty="MEDIUM",
    ),
    _q(
        153,
        "BEHAVIORAL_HR",
        "Describe a project that failed or slipped. What did you do next? Use STAR briefly.",
        keywords=("fail", "learn", "action", "result", "situation"),
        expected="STAR story: miss, ownership, recovery, lesson.",
        eval_type="behavioral",
        difficulty="MEDIUM",
    ),
    _q(
        154,
        "BEHAVIORAL_HR",
        "Tell me about a time you led without authority. 4-6 sentences.",
        keywords=("lead", "influence", "team", "result"),
        expected="Influence story with a clear outcome.",
        eval_type="behavioral",
        difficulty="MEDIUM",
    ),
    _q(
        155,
        "BEHAVIORAL_HR",
        "How do you handle tight deadlines and pressure in an interview-week crunch? 4 short bullets.",
        keywords=("priorit", "communicat", "scope", "deadline"),
        expected="Prioritize, communicate, cut scope, protect quality of the critical path.",
        eval_type="behavioral",
        difficulty="EASY",
    ),
    # Extra SHORT ANSWER constraints
    _q(
        156,
        "SHORT_ANSWER",
        "Explain CI/CD in one sentence.",
        keywords=("continuous", "integrat", "deploy"),
        expected="Automated integration, test, and delivery of software.",
        eval_type="factual",
        word_limit=40,
        difficulty="EASY",
    ),
    _q(
        157,
        "SHORT_ANSWER",
        "In at most 30 words: what is Kubernetes?",
        keywords=("kubernetes", "container", "orchestr"),
        expected="Container orchestration platform for deploying and scaling workloads.",
        eval_type="factual",
        word_limit=30,
        difficulty="MEDIUM",
    ),
    _q(
        158,
        "SHORT_ANSWER",
        "List exactly three HTTP methods and one-line use each.",
        keywords=("get", "post", "put", "delete", "patch"),
        expected="GET retrieve; POST create; PUT/PATCH update; DELETE remove.",
        bullet_count=3,
        difficulty="EASY",
    ),
    _q(
        159,
        "SHORT_ANSWER",
        "In one sentence: what does idempotent mean for an API?",
        keywords=("idempotent", "same", "request", "result"),
        expected="Repeating the same request leaves the same resource state.",
        eval_type="factual",
        word_limit=40,
        difficulty="MEDIUM",
    ),
    # Extra FOLLOW-UP chains (identical history for every model)
    _q(
        160,
        "FOLLOW_UP",
        "What is a database index?",
        keywords=("index", "lookup", "speed"),
        expected="A structure that speeds lookups, at some write cost.",
        eval_type="follow_up",
        difficulty="EASY",
    ),
    _q(
        161,
        "FOLLOW_UP",
        "How does an index speed up a WHERE clause?",
        keywords=("b-tree", "seek", "scan", "pointer", "lookup"),
        expected="The engine seeks the key in the index instead of scanning every row.",
        eval_type="follow_up",
        difficulty="MEDIUM",
        history=(
            ("user", "What is a database index?"),
            ("assistant", "A structure that speeds lookups, at some write cost."),
        ),
    ),
    _q(
        162,
        "FOLLOW_UP",
        "When should you not add an index?",
        keywords=("write", "small", "column", "update", "insert"),
        expected="Avoid on tiny tables, high-write columns, or low-selectivity fields.",
        eval_type="follow_up",
        difficulty="HARD",
        history=(
            ("user", "What is a database index?"),
            ("assistant", "A structure that speeds lookups, at some write cost."),
            ("user", "How does an index speed up a WHERE clause?"),
            (
                "assistant",
                "The engine seeks the key in the index instead of scanning every row.",
            ),
        ),
    ),
    _q(
        163,
        "FOLLOW_UP",
        "What is Docker?",
        keywords=("docker", "container", "image"),
        expected="A platform to build and run containers from images.",
        eval_type="follow_up",
        difficulty="EASY",
    ),
    _q(
        164,
        "FOLLOW_UP",
        "How is a container different from a virtual machine?",
        keywords=("kernel", "hypervisor", "os", "lighter", "vm"),
        expected="Containers share the host kernel; VMs virtualize hardware/OS.",
        eval_type="follow_up",
        difficulty="MEDIUM",
        history=(
            ("user", "What is Docker?"),
            ("assistant", "A platform to build and run containers from images."),
        ),
    ),
    _q(
        165,
        "FOLLOW_UP",
        "When would you still choose a VM over containers?",
        keywords=("kernel", "isolation", "windows", "legacy", "security"),
        expected="Stronger isolation, different kernels/OS, or legacy stacks that need a full guest OS.",
        eval_type="follow_up",
        difficulty="HARD",
        history=(
            ("user", "What is Docker?"),
            ("assistant", "A platform to build and run containers from images."),
            ("user", "How is a container different from a virtual machine?"),
            ("assistant", "Containers share the host kernel; VMs virtualize hardware/OS."),
        ),
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


# CueAI realtime subset (short questions) — same order subset for --cueai / --category realtime
CUEAI_REALTIME_PROMPTS: list[PromptCase] = [
    p for p in PROMPTS if p.category == "REALTIME_INTERVIEW"
]


def select_prompts(
    *,
    cueai_only: bool = False,
    quick: bool = False,
    category: str | None = None,
) -> list[PromptCase]:
    prompts = list(PROMPTS)
    if cueai_only:
        prompts = [p for p in prompts if p.category == "REALTIME_INTERVIEW"]
    if category:
        prompts = [p for p in prompts if p.category == category]
    if quick:
        picked: list[PromptCase] = []
        for cat in REQUIRED_CATEGORIES:
            cat_items = [p for p in prompts if p.category == cat]
            picked.extend(cat_items[:2])
        return picked
    return prompts


def category_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for p in PROMPTS:
        counts[p.category] = counts.get(p.category, 0) + 1
    return counts


def validate_question_bank(min_total: int = 60, min_per_category: int = 5) -> None:
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
    expected_ids = [f"Q{n:02d}" for n in range(1, len(PROMPTS) + 1)]
    if ids != expected_ids:
        raise ValueError("Question IDs must stay sequential (Q01, Q02, ...) in bank order")
    for p in PROMPTS:
        if p.eval_type in {"aptitude", "logical"} and not (
            p.expected_answer or p.accepted_answers
        ):
            raise ValueError(f"{p.id} ({p.category}) needs a verified expected answer")
    for p in PROMPTS:
        if p.eval_type == "follow_up" and p.history:
            for role, _content in p.history:
                if role not in {"user", "assistant"}:
                    raise ValueError(f"{p.id} follow-up history has invalid role {role}")
