package storage

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/repos"
)

// getDocKey get doc file key
func (site *Site) getDocKey(docFolder, fileName string) string {
	return site.GetSourceKey(repos.PrefixDocs, docFolder, fileName)
}

// GetDocs get page's docs
func (site *Site) GetDocs(folder string) ([]map[string]string, error) {
	if site.docs == nil {
		site.docs = make(map[string][]map[string]string)
	}

	prefix := site.GetSourcePrefix(repos.PrefixDocs, folder)

	docs, ok := site.docs[strings.ToLower(prefix)]
	if !ok {
		docs = []map[string]string{}
		files, _ := site.GetAllFiles(prefix)
		for _, file := range files {
			if file.IsDir {
				continue
			}
			doc := site.getDoc(file)
			if doc != nil {
				docs = append(docs, doc)
			}
		}
		site.docs[strings.ToLower(prefix)] = docs
	}

	return docs, nil
}

func (site *Site) getDoc(file *get3w.File) map[string]string {
	data, _ := site.Read(site.GetSourceKey(file.Path))
	if data == nil {
		return nil
	}

	doc := make(map[string]string)
	ext := getExt(file.Path)
	content := fmatter.Read(data, doc)
	doc["content"] = getStringByExt(ext, content)
	if doc["id"] == "" {
		doc["id"] = removeExt(file.Name)
	}
	if doc["title"] == "" {
		doc["title"] = doc["id"]
	}
	if doc["lastModified"] == "" {
		doc["lastModified"] = file.LastModified
	}
	if doc["url"] == "" {
		url := "docs/:id.html"
		for key, value := range doc {
			url = strings.Replace(url, ":"+key, value, -1)
		}
		doc["url"] = url
	}

	return doc
}
