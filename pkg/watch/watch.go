package watch

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"text/template"
)

// Run the watcher
func Run(port int, root string) {
	if port == 0 {
		port = 8000
	}
	if root == "" {
		root = "."
	}

	reloadCfg.port = port
	reloadCfg.root = root
	reloadCfg.command = ""
	reloadCfg.ignores = ""
	reloadCfg.private = false
	reloadCfg.proxy = 0
	reloadCfg.monitor = true
	reloadCfg.delay = 0

	if _, e := os.Open(reloadCfg.command); e == nil {
		// turn to abs path if exits
		abs, _ := filepath.Abs(reloadCfg.command)
		reloadCfg.command = abs
	}

	// compile templates
	t, _ := template.New("reloadjs").Parse(RELOAD_JS)
	reloadCfg.reloadJs = t
	t, _ = template.New("dirlist").Parse(DIR_HTML)
	reloadCfg.dirListTmpl = t
	t, _ = template.New("doc").Parse(HELP_HTML)
	reloadCfg.docTmpl = t

	// log.SetFlags(log.LstdFlags | log.Lshortfile)
	compilePattens()
	if e := os.Chdir(reloadCfg.root); e != nil {
		log.Panic(e)
	}
	if reloadCfg.monitor {
		startMonitorFs()
		go processFsEvents()
	}
	http.HandleFunc("/", handler)

	int := ":" + strconv.Itoa(reloadCfg.port)
	p := strconv.Itoa(reloadCfg.port)
	mesg := ""
	if reloadCfg.proxy != 0 {
		mesg += "; proxy site http://127.0.0.1:" + strconv.Itoa(reloadCfg.proxy)
	}
	mesg += "; please visit http://127.0.0.1:" + p
	if reloadCfg.private {
		int = "localhost" + int
	}
	fmt.Printf("listens on port:%s%s\n", p, mesg)
	if err := http.ListenAndServe(int, nil); err != nil {
		log.Fatal(err)
	}
}
