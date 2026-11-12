// Brauzer üçün nümunə. Real fayl (subjects.js) `python build_subjects.py` ilə yaranır və gitignore-dadır.
// kind: "theory" (nəzəri sual) | "problem" (məsələ) | "speaking" (ingilis dilində danışıq, etalon cavabsız)
// answer: "voice" | "text" (cavabın standart forması); ticket: biletə hər qrupdan bir sual düşür
window.SUBJECTS = [{
  id: "demo", short: "Demo", name: "Nümunə fənn", exam: "Kollokvium", lang: "az", answer: "voice",
  ticket: ["a", "a", "b"], ticketNote: "Nümunə: 3 sual düşür.",
  questions: [
    { n: 1, q: "Nümunə sual 1", kind: "theory", group: "a", src: "umumi", answer: "Etalon cavab." },
    { n: 2, q: "Nümunə sual 2", kind: "theory", group: "a", src: "umumi", answer: "Etalon cavab." },
    { n: 3, q: "Nümunə sual 3", kind: "theory", group: "b", src: "umumi", answer: "Etalon cavab." },
  ],
}];
