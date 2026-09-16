package com.example.kakuge;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VideoRepository extends JpaRepository<Video, Long> {

    /** 動画名の部分一致検索（大文字小文字を区別しない） */
    List<Video> findByNameContainingIgnoreCase(String name);
}
