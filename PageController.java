package com.example.kakuge;

import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/** ページ（画面）を返すコントローラ */
@Controller
public class PageController {

    private final VideoRepository repo;

    public PageController(VideoRepository repo) {
        this.repo = repo;
    }

    /** ホーム画面：動画リスト（タイトル検索対応） */
    @GetMapping("/")
    public String home(@RequestParam(name = "q", required = false) String q, Model model) {
        List<Video> videos = (q == null || q.isBlank())
                ? repo.findAll()
                : repo.findByNameContainingIgnoreCase(q.trim());
        model.addAttribute("videos", videos);
        model.addAttribute("q", q == null ? "" : q);
        return "home";
    }

    /** 比較画面：動画AとBを指定して開く */
    @GetMapping("/compare")
    public String compare(@RequestParam("a") Long aId, @RequestParam("b") Long bId, Model model) {
        Optional<Video> oa = repo.findById(aId);
        Optional<Video> ob = repo.findById(bId);
        if (oa.isEmpty() || ob.isEmpty()) {
            return "redirect:/";
        }
        model.addAttribute("a", oa.get());
        model.addAttribute("b", ob.get());
        return "compare";
    }
}
