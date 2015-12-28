package main

import (
	"github.com/get3w/get3w/www-api/api"
	"github.com/get3w/get3w/www-api/api/apps"
	"github.com/get3w/get3w/www-api/api/status"

	log "github.com/Sirupsen/logrus"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
)

func main() {
	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(api.StoreHeaders())

	e.SetHTTPErrorHandler(func(err error, c *echo.Context) {
		if he, ok := err.(*echo.HTTPError); ok {
			api.Error(c, he.Code(), he)
		} else {
			api.ErrorInternal(c, err)
		}
	})

	e.Get("/static/proxy.html", api.StaticProxy)
	e.Get("/static/xdomain.min.js", api.StaticXDomain)

	// Apps Files start
	// e.Post("/api/apps/:owner/:name/files/actions/checksum", files.Checksum)
	// e.Post("/api/apps/:owner/:name/files/actions/push", files.Push)
	// e.Delete("/api/apps/:owner/:name/files/*", files.Delete)
	// e.Put("/api/apps/:owner/:name/files/*", files.Edit)
	// e.Get("/api/apps/:owner/:name/*", files.Get)
	// e.Get("/api/apps/:owner/:name/files", files.List)
	// e.Get("/api/apps/:owner/:name/files/*", files.List)
	//
	// // Apps Folders start
	// e.Post("/api/apps/:owner/:name/folders", folders.Create)
	// e.Delete("/api/apps/:owner/:name/folders", folders.Delete)
	//
	// // Apps start
	// e.Post("/api/apps", apps.Create)
	// e.Delete("/api/apps/:owner/:name", apps.Delete)
	// e.Patch("/api/apps/:owner/:name", apps.Edit)
	// e.Get("/api/apps/:owner/:name", apps.Get)
	e.Get("/api/apps", apps.List)
	// e.Post("/api/apps/:owner/:name/actions/load", apps.Load)
	e.Post("/api/apps/actions/open", apps.Open)
	// e.Post("/api/apps/:owner/:name/actions/publish", apps.Publish)
	// e.Post("/api/apps/:owner/:name/actions/save", apps.Save)
	// e.Post("/api/apps/:owner/:name/actions/star", apps.Star)

	// Status start
	e.Get("/api/status", status.Get)

	e.Static("/*", "E:\\get3w-js\\public\\get3w\\")

	e.Run(port)
}

var port string

func init() {
	log.SetFormatter(&log.JSONFormatter{})
	port = ":49393"
}
