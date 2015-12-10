package fmatter

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

type Frontmatter struct {
	Title string
}

func TestReadMD(t *testing.T) {
	data := []byte(`---
title: Some Title
---
content`)

	frontmatter := &Frontmatter{}

	content := Read(data, frontmatter)
	assert.Equal(t, content, []byte("content"))
}

func TestReadHTML(t *testing.T) {
	data := []byte(`<!--
title: Some Title
-->
content`)

	frontmatter := &Frontmatter{}

	content := Read(data, frontmatter)
	assert.Equal(t, content, []byte("content"))
}

//
// func TestWrite(t *testing.T) {
// 	frontmatter := &Frontmatter{
// 		Title: "Some Title",
// 	}
//
// 	content, err := Write(ExtMD, frontmatter, []byte("content"))
//
// 	fmt.Println(string(content))
//
// 	assert.Nil(t, err)
// 	assert.Equal(t, `---
// title: Some Title
// ---
// content
// `, string(content))
// }
//
// type testItem struct {
// 	data            []byte
// 	expectedContent []byte
// }
//
// var testItems = []testItem{
// 	{[]byte(`---
// frontmatter: simple
// ---
// content`),
// 		[]byte(`content`)},
// 	{[]byte(`  content`),
// 		[]byte(`  content`)},
// 	{[]byte(`---
// content`),
// 		[]byte(`---
// content`)},
// }
//
// func TestItems(t *testing.T) {
// 	frontmatter := make(map[string]interface{})
//
// 	for _, item := range testItems {
// 		content, err := Read(ExtMD, item.data, frontmatter)
// 		if err != nil {
// 			t.Fatal(err)
// 		}
//
// 		if bytes.Compare(content, item.expectedContent) != 0 {
// 			t.Fatalf("unexpected content:\n%v\nvs.\n%v",
// 				string(content), string(item.expectedContent))
// 		}
// 	}
// }
