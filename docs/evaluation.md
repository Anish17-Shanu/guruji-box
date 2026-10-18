# Tutor evaluation

The offline retriever ranks lesson sections using token overlap. Evaluation cases should cover relevant, ambiguous, unrelated and insufficient-evidence questions. No evaluation was run against Gemini because no provider key was supplied; the app deliberately returns grounded local passages or an insufficient-evidence response.

The repeatable inputs are in `data/eval/questions.json`. Record retrieval hit rate, source accuracy, latency and token count from a configured provider run before releasing an AI-backed tutor.
