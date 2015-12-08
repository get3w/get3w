package storage

import (
	"strings"

	"github.com/get3w/get3w/repos"
)

// getContentKey get html file key by sectionName
func (site *Site) getContentKey(relatedURL string) string {
	return site.GetSourceKey(repos.PrefixContents, relatedURL)
}

// GetContents get content models by contentName
func (site *Site) GetContents(contentName string) ([]map[string]string, error) {
	if site.contents == nil {
		site.contents = make(map[string][]map[string]string)
	}

	contents, ok := site.contents[strings.ToLower(contentName)]
	if !ok {
		contents := []map[string]string{}
		files, _ := site.GetAllFiles(site.GetSourcePrefix(repos.PrefixContents, contentName))
		for _, file := range files {
			if file.IsDir {
				continue
			}
			data := make(map[string]string)
			data["name"] = file.Name
			data["title"] = file.Name
			data["last_modified"] = file.LastModified
			content, _ := site.Read(site.GetSourceKey(file.Path))
			data["content"] = content

			contents = append(contents, data)
		}
	}

	return contents, nil
}
