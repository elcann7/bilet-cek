<div align="center">

# Bilet Çək

**Universitet kollokvium və imtahanlarına hazırlıq: fənni seç, bilet çək, cavab ver, süni intellektdən 20 ballıq kollokvium balı al.**

[![Canlı sayt](https://img.shields.io/badge/canlı-bilet--cek.vercel.app-7a2a2a?style=flat-square)](https://bilet-cek.vercel.app)
[![Gemini](https://img.shields.io/badge/AI-Gemini-4a4f57?style=flat-square)](https://aistudio.google.com)

**[Saytı aç →](https://bilet-cek.vercel.app)**

</div>

---

Əvvəl yalnız ADİAK kollokviumu üçün idi (`adiak-bilet`), indi bütün fənlər üçün ümumidir. Fənni seçirsən, real biletdəki kimi suallar düşür, cavabını **səslə və ya yazılı** verirsən, sonra süni intellekt cavabı etalonla müqayisə edib qiymət verir.

## Fənlər

| Fənn | Sual növü | Cavab forması | Qiymətləndirmə |
|---|---|---|---|
| **ADİAK** | 30 nəzəri sual (hər onluqdan 1) | səslə (yazılı da olar) | etalon cavabla müqayisə |
| **Fizika** | 19 nəzəri sual + 10 məsələ | yazılı (səslə də olar) | nəzəriyyədə etalonla, məsələdə düzgün həll və cavabla |
| **XDİAK** (ingilis dili) | 25 speaking mövzusu | səslə (yazılı da olar) | qrupun **səviyyəsinə** görə: Elementary-dən Upper-Intermediate-ə; leksik və qrammatik səhvlər sayılır, səviyyədən yuxarı söz tələb olunmur |

Yeni fənn əlavə etmək `build_subjects.py`-də bir funksiya yazmaq deməkdir.

## Xüsusiyyətlər

- **Real imtahan hissi:** bilet çəkmə, hazırlıq vaxtı, hər suala vaxt limiti.
- **Səs → mətn → qiymət bir addımda:** Gemini həm danışığı mətnə çevirir, həm qiymətləndirir. Brauzerin nitq tanıması işlədilmir (iPhone Safari Azərbaycan dilini tanımır).
- **Sual növünə uyğun qiymətləndirmə:** nəzəri sual, məsələ (həll yolu və son cavab) və ingilis dilində danışıq (task, qrammatika, lüğət, axıcılıq) üçün ayrı meyarlar.
- **Kollokvium 20 baldır:** hər sual 0–10 keyfiyyət qiyməti alır (Təhsil Nazirliyinin 1060 saylı əsasnaməsindəki meyarlara uyğun), biletin balı bu ortalamanın 20-yə çevrilməsidir. Fənn üzrə dəyişmək üçün `max` sahəsi var.
- **Ətraflı rəy:** düzgün fikirlər, çatışmayanlar (ingilis dilində: səhvlər və düzəlişlər), nitq qeydi.
- **Profillər, tarixçə, zəif suallar:** nəticələr fənnə görə ayrı saxlanır; "zəif suallara üstünlük" rejimi.
- **Məxfilik:** nəticələr yalnız sənin brauzerindədir. Hər istifadəçi öz pulsuz Gemini açarını işlədir; açar kodda yoxdur.

## Texnologiyalar

Build addımı yoxdur: sadə HTML + CSS + JavaScript, **Vercel Functions** (Node 20+), MediaRecorder / Web Audio API, Gemini API (strukturlu JSON cavab, ehtiyat model).

## Fayllar

```
index.html, style.css, app.js     sayt
api/grade.js                      Vercel funksiyası: sual növünə görə prompt, Gemini sorğusu
build_subjects.py                 mənbə fayllardan (docx, md, pdf) subjects.js və api/_data.js yaradır
subjects.example.js               fənn məlumatının nümunəsi
api/_data.example.js              eyni məlumat, server üçün
```

> Real etalon cavablar (`subjects.js`, `api/_data.js`, `answers/`) dərs materiallarına əsaslandığı üçün bu repo-da yoxdur.

## Özün işə salmaq

1. `cp subjects.example.js subjects.js` və `cp api/_data.example.js api/_data.js`, ya da `python build_subjects.py` (öz mənbə fayllarınla).
2. Yerli: `npx vercel dev`. Yerləşdirmə: `npx vercel --prod`. Mikrofon yalnız HTTPS-də işləyir.
