import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  HostListener,
  ElementRef,
  ViewChild,
  AfterViewInit,
  Renderer2,
  OnDestroy,
} from "@angular/core";
import {
  ErrorService,
  errorCode,
  errorMessage,
} from "@project-sunbird/sunbird-player-sdk-v9";
import { identity } from "rxjs";

import { PlayerConfig } from "./playerInterfaces";
import { ViewerService } from "./services/viewer.service";
import { SunbirdVideoPlayerService } from "./sunbird-video-player.service";
@Component({
  selector: "sunbird-video-player",
  templateUrl: "./sunbird-video-player.component.html",
  styleUrls: ["./sunbird-video-player.component.scss"],
})
export class SunbirdVideoPlayerComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @Input() playerConfig: PlayerConfig;
  @Output() playerEvent: EventEmitter<object>;
  @Input() streamingUrl: string;
  @Output() telemetryEvent: EventEmitter<any> = new EventEmitter<any>();
  @ViewChild("videoPlayer", { static: true }) videoPlayerRef: ElementRef;
  viewState = "player";
  public traceId: string;
  public nextContent: any;
  showContentError: boolean;
  showControls = true;
  sideMenuConfig = {
    showShare: true,
    showDownload: true,
    showReplay: true,
    showExit: true,
  };
  private unlistenTouchStart: () => void;
  private unlistenMouseMove: () => void;
  isPaused = false;
  showQumlPlayer = false;
  QumlPlayerConfig: any = {};
  videoInstance: any;
  currentInterceptionTime;
  currentInterceptionUIId;

  constructor(
    public videoPlayerService: SunbirdVideoPlayerService,
    public viewerService: ViewerService,
    public cdr: ChangeDetectorRef,
    private renderer2: Renderer2,
    public errorService: ErrorService
  ) {
    this.playerEvent = this.viewerService.playerEvent;
    this.viewerService.playerEvent.subscribe((event) => {
      if (event.type === "pause") {
        this.isPaused = true;
        this.showControls = true;
      }
      if (event.type === "play") {
        this.isPaused = false;
      }
      if (event.type === "loadstart") {
        this.viewerService.raiseStartEvent(event);
      }
      if (event.type === "ended") {
        this.viewerService.endPageSeen = true;
        this.viewerService.raiseEndEvent();
        this.viewState = "end";
      }
      if (event.type === "error") {
        let code = errorCode.contentLoadFails,
          message = errorMessage.contentLoadFails;
        if (this.viewerService.isAvailableLocally) {
          (code = errorCode.contentLoadFails),
            (message = errorMessage.contentLoadFails);
        }
        if (code === errorCode.contentLoadFails) {
          this.showContentError = true;
        }
        this.viewerService.raiseExceptionLog(
          code,
          message,
          event,
          this.traceId
        );
      }
      const events = [
        { type: "volumechange", telemetryEvent: "VOLUME_CHANGE" },
        { type: "seeking", telemetryEvent: "DRAG" },
        { type: "fullscreen", telemetryEvent: "FULLSCREEN" },
        { type: "ratechange", telemetryEvent: "RATE_CHANGE" },
      ];
      events.forEach((data) => {
        if (event.type === data.type) {
          this.viewerService.raiseHeartBeatEvent(data.telemetryEvent);
        }
      });
    });
  }

  @HostListener("document:TelemetryEvent", ["$event"])
  onTelemetryEvent(event) {
    this.telemetryEvent.emit(event.detail);
  }

  ngOnInit() {
    setInterval(() => {
      if (!this.isPaused) {
        this.showControls = false;
      }
    }, 5000);

    /* tslint:disable:no-string-literal */
    this.nextContent = this.playerConfig.config.nextContent;
    this.traceId = this.playerConfig.config["traceId"];
    this.sideMenuConfig = {
      ...this.sideMenuConfig,
      ...this.playerConfig.config.sideMenu,
    };
    console.log("inside video player component", this.playerConfig);
    this.viewerService.initialize(this.playerConfig);
    this.videoPlayerService.initialize(this.playerConfig);
    window.addEventListener(
      "offline",
      this.raiseInternetDisconnectionError,
      true
    );
    this.QumlPlayerConfig.config = this.playerConfig.config;
    this.QumlPlayerConfig.config.sideMenu.enable = false;
    this.QumlPlayerConfig.context = this.playerConfig.context;
    this.setTelemetryObjectRollup(this.playerConfig.metadata.identifier);
  }

  raiseInternetDisconnectionError = () => {
    let code = errorCode.internetConnectivity;
    let message = errorMessage.internetConnectivity;
    let stacktrace = `${code}: ${message}`;
    this.viewerService.raiseExceptionLog(
      code,
      message,
      stacktrace,
      this.traceId
    );
  };

  sidebarMenuEvent(event) {
    this.viewerService.sidebarMenuEvent.emit(event);
  }

  ngAfterViewInit() {
    const videoPlayerElement = this.videoPlayerRef.nativeElement;
    this.unlistenMouseMove = this.renderer2.listen(
      videoPlayerElement,
      "mousemove",
      () => {
        this.showControls = true;
      }
    );

    this.unlistenTouchStart = this.renderer2.listen(
      videoPlayerElement,
      "touchstart",
      () => {
        this.showControls = true;
      }
    );

    const contentCompabilityLevel =
      this.playerConfig.metadata["compatibilityLevel"];
    if (contentCompabilityLevel) {
      const checkContentCompatible =
        this.errorService.checkContentCompatibility(contentCompabilityLevel);
      if (!checkContentCompatible["isCompitable"]) {
        this.viewerService.raiseExceptionLog(
          errorCode.contentCompatibility,
          errorMessage.contentCompatibility,
          checkContentCompatible["error"]["message"],
          this.traceId
        );
      }
    }
  }

  sideBarEvents(event) {
    this.playerEvent.emit(event);
    if (event === "DOWNLOAD") {
      this.downloadVideo();
    }
    const events = ["SHARE", "DOWNLOAD_MENU", "EXIT", "CLOSE_MENU"];
    events.forEach((data) => {
      if (event === data) {
        this.viewerService.raiseHeartBeatEvent(data);
      }
      if (event === "EXIT") {
        this.viewerService.sidebarMenuEvent.emit("CLOSE_MENU");
      }
    });
  }

  setTelemetryObjectRollup(id) {
    if (this.QumlPlayerConfig.context) {
      const hasObjectRollup =
        this.QumlPlayerConfig &&
        this.QumlPlayerConfig.context &&
        this.QumlPlayerConfig.context.objectRollup;
      if (!hasObjectRollup) {
        this.QumlPlayerConfig.context.objectRollup = {};
      }
      const levels = Object.keys(this.QumlPlayerConfig.context.objectRollup);
      this.QumlPlayerConfig.context.objectRollup[`l${levels.length + 1}`] = id;
    }
  }

  playContent(event) {
    this.viewerService.raiseHeartBeatEvent(event.type);
  }

  replayContent(event) {
    this.playerEvent.emit(event);
    this.viewState = "player";
    this.viewerService.raiseHeartBeatEvent("REPLAY");
  }

  exitContent(event) {
    this.playerEvent.emit(event);
    this.viewerService.raiseHeartBeatEvent("EXIT");
  }

  downloadVideo() {
    const a = document.createElement("a");
    a.href = this.viewerService.artifactUrl;
    a.download = this.viewerService.contentName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.viewerService.raiseHeartBeatEvent("DOWNLOAD");
  }

  qumlPlayerEvents(event) {
    if (event.eid === "QUML_SUMMARY") {
      const score = parseInt(
        event.edata.extra.find((p) => p.id === "score")["value"],
        10
      );
      this.viewerService.interceptionResponses[this.currentInterceptionTime] = {
        score,
        isSkipped: false,
      };
      document.querySelector(
        `[data-marker-time="${this.currentInterceptionTime}"]`
      )["style"].backgroundColor = "green";
      this.showQumlPlayer = false;
      this.videoInstance.play();
      this.videoInstance.controls(true);
    }
  }

  questionSetData({ response, time, identifier }) {
    this.QumlPlayerConfig.metadata = response;
    this.QumlPlayerConfig.metadata["showStartPage"] = "No";
    this.QumlPlayerConfig.metadata["showEndPage"] = "No";
    this.currentInterceptionTime = time;
    this.currentInterceptionUIId = identifier;
    this.showQumlPlayer = true;
  }

  playerInstance(event) {
    this.videoInstance = event;
  }

  @HostListener("window:beforeunload")
  ngOnDestroy() {
    this.viewerService.raiseEndEvent();
    this.unlistenTouchStart();
    this.unlistenMouseMove();
    window.removeEventListener(
      "offline",
      this.raiseInternetDisconnectionError,
      true
    );
  }
}
