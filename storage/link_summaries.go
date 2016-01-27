package storage

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/get3w/get3w"
)

var (
	regexOuter = regexp.MustCompile(`\[([^\]]+)\]\(([^\)]+)\)`)
	regexInner = regexp.MustCompile(`([^'"]+)\s+['"]([^'"]+)['"]|([^'"]+)`)
)

// LoadSitePageSummaries load summary summaries for current site
func (parser *Parser) LoadSitePageSummaries() {
	var summaries []*get3w.PageSummary

	if parser.Storage.IsExist(parser.key(KeyPages)) {
		data, _ := parser.readAll(KeyPages)
		summaries = getSitePageSummariesByString(data)
	} else {
		files, _ := parser.Storage.GetFiles(parser.prefix(""))
		summaries = getSitePageSummariesByFiles(files)
	}

	parser.Current.PageSummaries = summaries
}

func getSitePageSummariesByString(data []byte) []*get3w.PageSummary {
	summaries := []*get3w.PageSummary{}

	lines := strings.Split(string(data), "\n")
	var previousSpaceNum int
	var previousParent *get3w.PageSummary

	for _, line := range lines {
		if !strings.HasPrefix(strings.TrimSpace(line), "*") {
			continue
		}

		name, path, url, ok := getLineElements(line)
		if !ok {
			continue
		}

		spaceNum := strings.Index(line, "*")
		summary := &get3w.PageSummary{
			Name: name,
			Path: path,
			URL:  url,
		}

		var parent *get3w.PageSummary
		if previousSpaceNum == spaceNum {
			parent = previousParent
		} else {
			parent = getParentSummary(spaceNum, summaries)
		}

		if parent == nil {
			summaries = append(summaries, summary)
		} else {
			parent.Children = append(parent.Children, summary)
		}

		previousSpaceNum = spaceNum
		previousParent = parent
	}

	return summaries
}

func getSitePageSummariesByFiles(files []*get3w.File) []*get3w.PageSummary {
	summaries := []*get3w.PageSummary{}

	for _, file := range files {
		if file.IsDir || file.Name == KeyReadme {
			continue
		}
		ext := getExt(file.Name)
		if ext == ExtHTML || ext == ExtMD {
			summary := &get3w.PageSummary{
				Name: strings.TrimRight(file.Name, ext),
				Path: file.Name,
				URL:  file.Name,
			}
			summaries = append(summaries, summary)
		}
	}

	return summaries
}

func getLineElements(line string) (name, path, url string, ok bool) {
	arrOuter := regexOuter.FindStringSubmatch(line)
	if len(arrOuter) != 3 || arrOuter[0] == "" || arrOuter[1] == "" || arrOuter[2] == "" {
		return "", "", "", false
	}

	arrInner := regexInner.FindStringSubmatch(arrOuter[2])
	if len(arrInner) != 4 || arrInner[0] == "" {
		return "", "", "", false
	}

	name, path, url = arrOuter[1], "", ""
	if arrInner[3] == "" {
		path, url = strings.TrimSpace(arrInner[1]), strings.TrimSpace(arrInner[2])
	} else {
		path = strings.TrimSpace(arrInner[3])
	}
	if url == "" {
		url = getPageURL(name, path)
	}

	if name == "" || path == "" || url == "" {
		return "", "", "", false
	}

	return name, path, url, true
}

func getPageURL(name, path string) string {
	pageURL := name + ExtHTML
	ext := getExt(path)
	if ext == ExtMD {
		pageURL = strings.Replace(path, ExtMD, ExtHTML, 1)
	} else if ext == ExtHTML {
		pageURL = path
	}
	return pageURL
}

func getParentSummary(spaceNum int, summaries []*get3w.PageSummary) *get3w.PageSummary {
	if spaceNum == 0 || len(summaries) == 0 {
		return nil
	}
	summary := summaries[len(summaries)-1]
	for i := 0; i < spaceNum; i++ {
		if len(summary.Children) == 0 {
			break
		}
		summary = summary.Children[len(summary.Children)-1]
	}
	return summary
}

// marshalPage parse page summary slice to string
func marshalPageSummaries(summaries []*get3w.PageSummary) string {
	lines := []string{}
	lines = append(lines, getSummaryString(0, summaries))

	retval := ""
	for _, line := range lines {
		retval += line + "\n"
	}
	return retval + "\n"
}

func getSummaryString(level int, summaries []*get3w.PageSummary) string {
	retval := ""
	for _, summary := range summaries {
		prefix := ""
		for i := 0; i < level; i++ {
			prefix += "\t"
		}
		if summary.URL == getPageURL(summary.Name, summary.Path) {
			retval += prefix + fmt.Sprintf("* [%s](%s)\n", summary.Name, summary.Path)
		} else {
			retval += prefix + fmt.Sprintf(`* [%s](%s "%s")\n`, summary.Name, summary.Path, summary.URL)
		}

		if len(summary.Children) > 0 {
			retval += getSummaryString(level+1, summary.Children)
		}
	}
	return retval
}
