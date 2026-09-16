package com.example.kakuge;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Entity
public class Video {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;      // 画面表示用の名前
    private String fileName;  // 保存した実ファイル名
    private long size;        // バイト数
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    /** 一覧表示用（テンプレートから呼ぶ） */
    public String getCreatedAtText() {
        return createdAt == null ? "" : createdAt.format(DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm"));
    }

    /** 一覧表示用（MB単位） */
    public String getSizeText() {
        return String.format("%.1f MB", size / 1024.0 / 1024.0);
    }
}
