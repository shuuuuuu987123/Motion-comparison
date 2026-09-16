package com.example.kakuge;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

/** 動画のアップロード・削除・配信を担当するコントローラ */
@Controller
public class VideoController {

    private final VideoRepository repo;

    @Value("${app.storage.dir}")
    private String storageDir;

    public VideoController(VideoRepository repo) {
        this.repo = repo;
    }

    /** アップロード（録画した動画やファイルを読み込んで保存） */
    @PostMapping("/videos")
    public String upload(@RequestParam("file") MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return "redirect:/";
        }
        String original = file.getOriginalFilename();
        String ext = ".webm";
        if (original != null && original.toLowerCase().endsWith(".mp4")) {
            ext = ".mp4";
        }
        String fileName = UUID.randomUUID() + ext;

        Path dir = Paths.get(storageDir);
        Files.createDirectories(dir);
        file.transferTo(dir.resolve(fileName).toAbsolutePath());

        Video v = new Video();
        v.setName(displayName(original));
        v.setFileName(fileName);
        v.setSize(file.getSize());
        repo.save(v);
        return "redirect:/";
    }

    /** 削除（ファイルとレコードの両方） */
    @PostMapping("/videos/{id}/delete")
    public String delete(@PathVariable Long id) {
        repo.findById(id).ifPresent(v -> {
            try {
                Files.deleteIfExists(Paths.get(storageDir, v.getFileName()));
            } catch (IOException ignored) {
            }
            repo.delete(v);
        });
        return "redirect:/";
    }

    /** 動画の配信（Range対応なのでブラウザのシークバーが使える） */
    @GetMapping("/videos/{id}/stream")
    @ResponseBody
    public ResponseEntity<Resource> stream(@PathVariable Long id) {
        Optional<Video> ov = repo.findById(id);
        if (ov.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Video v = ov.get();
        Resource res = new FileSystemResource(Paths.get(storageDir, v.getFileName()));
        if (!res.exists()) {
            return ResponseEntity.notFound().build();
        }
        String mediaType = v.getFileName().toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mediaType))
                .contentLength(contentLengthOf(res))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .body(res);
    }

    private long contentLengthOf(Resource res) {
        try {
            return res.contentLength();
        } catch (IOException e) {
            return 0;
        }
    }

    private String displayName(String original) {
        if (original == null || original.isBlank()) {
            return "録画";
        }
        String name = Paths.get(original.replace("\\", "/")).getFileName().toString();
        return name.replaceFirst("(?i)\\.(webm|mp4|mov|m4v)$", "");
    }
}
